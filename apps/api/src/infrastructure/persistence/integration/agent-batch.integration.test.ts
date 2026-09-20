import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  EntityBatchConflictError,
  Event,
  EventItem,
  Note,
  Task,
} from "../../../domain";
import type { EntityBatch } from "../../../domain/ports";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { PostgresNoteRepository } from "../notes/repositories/postgres-note.repository";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe.runIf(RUN_INTEGRATION)("PostgresEntityBatchWriter", () => {
  let ctx: PostgresTestContext;
  let writer: PostgresEntityBatchWriter;
  let events: PostgresEventRepository;
  let tasks: PostgresTaskRepository;
  let notes: PostgresNoteRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      writer = new PostgresEntityBatchWriter(ctx.db);
      events = new PostgresEventRepository(ctx.db);
      tasks = new PostgresTaskRepository(ctx.db);
      notes = new PostgresNoteRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function newEvent(userId = "user-1") {
    return Event.create({
      userId,
      name: "Dormir",
      description: "",
      startedAt: new Date("2026-09-15T02:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [
        EventItem.create({
          position: 0,
          type: "sleep",
          schemaVersion: 1,
          isPrimary: true,
          data: { trackedSleepTime: 420, score: 0 },
        }),
      ],
    });
  }

  function newTask(overrides: Partial<Parameters<typeof Task.create>[0]> = {}) {
    return Task.create({ userId: "user-1", name: "Casa", description: "", tags: [], ...overrides });
  }

  function batch(overrides: Partial<EntityBatch>): EntityBatch {
    return { userId: "user-1", events: [], tasks: [], notes: [], ...overrides };
  }

  async function count(table: string): Promise<number> {
    const { rows } = await ctx.pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE deleted_at IS NULL`);
    return rows[0].count;
  }

  test("creates, updates and deletes across kinds in one commit", async () => {
    const sleep = newEvent();
    await events.save(sleep);
    const oldTask = newTask({ name: "Velha" });
    await tasks.save(oldTask);

    const parent = newTask();
    const subtask = newTask({ name: "Varrer a casa", parentTaskId: parent.id });
    const note = Note.create({ userId: "user-1", content: "Usar vassoura nova", taskId: subtask.id });

    await writer.commit(
      batch({
        // Subtarefa antes do pai de proposito: a ordem de insercao e do writer.
        tasks: [
          { op: "create", entity: subtask },
          { op: "create", entity: parent },
          { op: "delete", id: oldTask.id, expectedRevision: oldTask.revision },
        ],
        events: [{ op: "update", entity: sleep.revise({ name: "Dormi pouco" }), expectedRevision: sleep.revision }],
        notes: [{ op: "create", entity: note }],
      }),
    );

    expect((await tasks.findById(subtask.id))?.parentTaskId).toBe(parent.id);
    expect(await tasks.findById(oldTask.id)).toBeNull();
    expect((await events.findById(sleep.id))?.name).toBe("Dormi pouco");
    expect((await notes.findById(note.id))?.taskId).toBe(subtask.id);
  });

  test("a failure after earlier writes rolls back everything", async () => {
    const existing = Note.create({ userId: "user-1", content: "já existe" });
    await notes.save(existing);
    const created = newTask();
    // Mesmo id: a insercao da nota falha na PK depois que a tarefa ja entrou.
    const duplicate = Note.create({ id: existing.id, userId: "user-1", content: "de novo" });

    await expect(
      writer.commit(
        batch({
          tasks: [{ op: "create", entity: created }],
          notes: [{ op: "create", entity: duplicate }],
        }),
      ),
    ).rejects.toThrow();

    expect(await tasks.findById(created.id)).toBeNull();
    expect((await notes.findById(existing.id))?.content).toBe("já existe");
  });

  test("a target owned by another user is a conflict and nothing is written", async () => {
    const foreign = newEvent("user-2");
    await events.save(foreign);
    const created = newTask();

    await expect(
      writer.commit(
        batch({
          tasks: [{ op: "create", entity: created }],
          events: [{ op: "update", entity: foreign.revise({ name: "Roubado" }), expectedRevision: foreign.revision }],
        }),
      ),
    ).rejects.toBeInstanceOf(EntityBatchConflictError);

    expect((await events.findById(foreign.id))?.name).toBe("Dormir");
    expect(await count("tasks")).toBe(0);
  });

  test("a revision bumped or a row deleted after staging is a conflict", async () => {
    const event = newEvent();
    await events.save(event);
    const staged = event.revise({ name: "Staged" });
    await events.update(event.revise({ name: "Outra aba" }), "user-1", event.revision);

    await expect(
      writer.commit(batch({ events: [{ op: "update", entity: staged, expectedRevision: event.revision }] })),
    ).rejects.toThrow(/alterado/);

    const task = newTask();
    await tasks.save(task);
    await tasks.delete(task.id, "user-1");
    await expect(
      writer.commit(batch({ tasks: [{ op: "delete", id: task.id, expectedRevision: task.revision }] })),
    ).rejects.toThrow(/não existe mais/);
  });

  test("refuses a reference to another user's task", async () => {
    const foreignParent = newTask({ userId: "user-2" });
    await tasks.save(foreignParent);

    await expect(
      writer.commit(batch({ tasks: [{ op: "create", entity: newTask({ parentTaskId: foreignParent.id }) }] })),
    ).rejects.toThrow(/referenciados/);
    expect(await count("tasks")).toBe(1);
  });

  test("deleting a parent and its child in the same batch does not fail on the child", async () => {
    const parent = newTask();
    await tasks.save(parent);
    const child = newTask({ parentTaskId: parent.id });
    await tasks.save(child);
    const note = Note.create({ userId: "user-1", content: "x", taskId: child.id });
    await notes.save(note);

    await writer.commit(
      batch({
        tasks: [
          { op: "delete", id: parent.id, expectedRevision: parent.revision },
          { op: "delete", id: child.id, expectedRevision: child.revision },
        ],
        notes: [{ op: "delete", id: note.id, expectedRevision: note.revision }],
      }),
    );

    expect(await count("tasks")).toBe(0);
    expect(await count("notes")).toBe(0);
  });
});
