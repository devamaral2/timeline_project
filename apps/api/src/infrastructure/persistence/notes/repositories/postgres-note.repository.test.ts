import { beforeEach, expect, test, vi } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { calculateMealTotals, Note, type MealItem } from "../../../../domain";
import type { MealNoteGenerationPayload } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { insertNote, PostgresNoteRepository } from "./postgres-note.repository";
import type { Tx } from "../../events/repositories/postgres-event.repository";

const jobs = vi.hoisted(() => ({
  enqueueMealNote: vi.fn().mockResolvedValue("job-id"),
  setAiJobResult: vi.fn(),
  setAiJobFailure: vi.fn(),
  completeCurrentAiJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../ai-jobs/ai-job-context", () => jobs);

beforeEach(() => vi.clearAllMocks());

function mealData(status: "pending" | "failed" = "pending"): MealItem {
  return {
    name: "Almoço", description: "banana", foodItems: [], totals: calculateMealTotals([]),
    generation: { status },
  };
}

test("insertNote enqueues a pending meal in the same transaction with immutable input and expected revision", async () => {
  const note = Note.create({ userId: "user-1", type: "meal", data: mealData() });
  const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }) };
  await insertNote(tx as unknown as Tx, note);
  expect(jobs.enqueueMealNote).toHaveBeenCalledWith(tx, note.id, note.userId, {
    noteId: note.id, userId: note.userId, expectedRevision: 1, description: "banana", name: "Almoço",
  });
});

test.each(["text", "legacy-meal", "failed-meal"])("insertNote does not enqueue %s notes", async (kind) => {
  const note = kind === "text"
    ? Note.create({ userId: "user-1", data: { body: "text" } })
    : Note.create({ userId: "user-1", type: "meal", data: {
      ...mealData("failed"), ...(kind === "legacy-meal" ? { generation: undefined } : {}),
    } });
  const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }) };
  await insertNote(tx as unknown as Tx, note);
  expect(jobs.enqueueMealNote).not.toHaveBeenCalled();
});

test.each([true, false])("generation compare-and-set records receipt atomically (updated=%s)", async (applied) => {
  const tx = { execute: vi.fn().mockResolvedValue({ rows: applied ? [{ id: "note-id" }] : [] }) };
  const db = { transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)) };
  const repository = new PostgresNoteRepository(db as unknown as NodePgDatabase<typeof schema>);
  const payload: MealNoteGenerationPayload = {
    noteId: "note-id", userId: "user-1", expectedRevision: 1, description: "banana", name: "Almoço",
  };
  const result = { status: "failed", noteId: payload.noteId } as const;
  await expect(repository.finishMealGeneration(payload, mealData("failed"), result)).resolves.toBe(applied);
  const query = new PgDialect().sqlToQuery(tx.execute.mock.calls[0][0]);
  expect(query.sql).toContain("AND deleted_at IS NULL");
  expect(query.sql).toContain("AND revision =");
  expect(query.sql).toContain("AND user_id =");
  expect(query.sql).toContain("AND type = 'meal'");
  expect(query.sql).toContain("data->'generation'->>'status' = 'pending'");
  expect(query.sql).toContain("data->>'description' =");
  expect(query.sql).toContain("data->>'name' =");
  expect(query.params).toEqual([JSON.stringify(mealData("failed")), payload.noteId, payload.userId, 1, "banana", "Almoço"]);
  expect(jobs.setAiJobResult).toHaveBeenCalledWith(applied ? result : { status: "skipped", noteId: payload.noteId });
  if (applied) expect(jobs.setAiJobFailure).toHaveBeenCalledWith("unavailable");
  else expect(jobs.setAiJobFailure).not.toHaveBeenCalled();
  expect(jobs.completeCurrentAiJob).toHaveBeenCalledWith(tx);
});

test("a skip completes the receipt without writing a note", async () => {
  const tx = { execute: vi.fn() };
  const db = { transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)) };
  const repository = new PostgresNoteRepository(db as unknown as NodePgDatabase<typeof schema>);
  const payload: MealNoteGenerationPayload = {
    noteId: "note-id", userId: "user-1", expectedRevision: 1, description: "banana", name: "Almoço",
  };
  await repository.finishMealGeneration(payload, null, { status: "skipped", noteId: payload.noteId });
  expect(tx.execute).not.toHaveBeenCalled();
  expect(jobs.completeCurrentAiJob).toHaveBeenCalledWith(tx);
});

test("a stale/cancelled job receipt failure propagates to roll back the enclosing transaction", async () => {
  const tx = { execute: vi.fn().mockResolvedValue({ rows: [{ id: "note-id" }] }) };
  const db = { transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)) };
  const repository = new PostgresNoteRepository(db as unknown as NodePgDatabase<typeof schema>);
  jobs.completeCurrentAiJob.mockRejectedValueOnce(new Error("stale job lease"));
  const payload: MealNoteGenerationPayload = {
    noteId: "note-id", userId: "user-1", expectedRevision: 1, description: "banana", name: "Almoço",
  };
  await expect(repository.finishMealGeneration(payload, mealData("failed"), { status: "failed", noteId: payload.noteId }))
    .rejects.toThrow("stale job lease");
});
