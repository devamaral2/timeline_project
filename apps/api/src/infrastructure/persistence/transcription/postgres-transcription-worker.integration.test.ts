import type { TranscriptionResult } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ArtifactBuilder } from "../../../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../../../api-core/tasks/create-task.usecase";
import { TRANSCRIPTION_FORMAT_JOB, TRANSCRIPTION_JOB } from "../../../api-core/transcription/transcription-requests";
import { RequestTranscriptionUseCase } from "../../../features/request-transcription/request-transcription.usecase";
import { DailyReadingGate } from "../../../features/save-daily-reading/daily-reading.gate";
import { TranscriptionWorkerUseCase } from "../../../features/transcription-worker/transcription-worker.usecase";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresWorkoutCatalog } from "../artifacts/postgres-workout.catalog";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresTaskCardQuery } from "../tasks/queries/postgres-task-card.query";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { OTHER_USER, USER, countRows, selectRows } from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresTranscriptionRequests } from "./postgres-transcription-requests";

// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const actor = { userId: USER, permissions: ["transcription:work"] };

const RESULT: TranscriptionResult = {
  video: { title: "Entrevista", channel: "Canal", durationSeconds: 3600, description: "Links", chapters: [] },
  source: "subtitles",
  segments: [{ startSeconds: 0, endSeconds: 4, speaker: "Falante 1", text: "Olá, tudo bem?" }],
  hotMoments: [],
  comments: [],
};

describe("servico local de transcricao no Postgres", () => {
  let ctx: PostgresTestContext;
  let tasks: PostgresTaskRepository;
  let artifacts: PostgresArtifactRepository;
  let request: RequestTranscriptionUseCase;
  let worker: TranscriptionWorkerUseCase;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    tasks = new PostgresTaskRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
    const builder = new ArtifactBuilder(new PostgresWorkoutCatalog(ctx.db));
    const writer = new PostgresEntityBatchWriter(ctx.db);
    const createTask = new CreateTaskUseCase(tasks, artifacts, builder, writer, () => now);
    const gate = new DailyReadingGate(new PostgresTaskCardQuery(ctx.db), artifacts, builder, createTask, writer, undefined, () => now);
    const requests = new PostgresTranscriptionRequests(ctx.db);
    request = new RequestTranscriptionUseCase(gate, requests);
    worker = new TranscriptionWorkerUseCase(gate, writer, requests, () => now);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function reserved() {
    const created = await request.execute({ url: VIDEO }, actor);
    const reservation = await worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    return { created, reservation };
  }

  test("reserva so o job da transcricao, so o da pessoa, e so um por vez", async () => {
    await ctx.pool.query(
      `INSERT INTO jobs (id, kind, user_id, actor_id, payload) VALUES ('01J00000000000000000000000', 'work', $1, $1, '{}')`,
      [USER],
    );
    const other = await request.execute({ url: VIDEO }, { userId: OTHER_USER });
    const mine = await request.execute({ url: "https://www.youtube.com/shorts/abcdefghijk" }, actor);

    const reservation = await worker.reserve(actor);

    expect(reservation).toMatchObject({ requestId: mine.requestId, url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(await worker.reserve(actor)).toBeUndefined();
    expect(await selectRows(ctx.pool, "SELECT kind, status FROM jobs WHERE task_id = $1", [other.requestId])).toEqual([
      { kind: TRANSCRIPTION_JOB, status: "queued" },
    ]);
    expect(await selectRows(ctx.pool, "SELECT status FROM jobs WHERE kind = 'work'")).toEqual([{ status: "queued" }]);
  });

  test("o lease vencido devolve o job para a fila e o lease velho perde o direito", async () => {
    const { created, reservation } = await reserved();
    await ctx.pool.query("UPDATE jobs SET lease_until = now() - interval '1 second' WHERE task_id = $1", [created.requestId]);

    const again = await worker.reserve(actor);

    expect(again).toMatchObject({ requestId: created.requestId });
    expect(again?.leaseToken).not.toBe(reservation.leaseToken);
    await expect(
      worker.renew({ requestId: created.requestId, leaseToken: reservation.leaseToken, stage: "download", percent: 5 }, actor),
    ).rejects.toThrow(/lease/i);
    await expect(
      worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "failed" }, actor),
    ).rejects.toThrow(/lease/i);
    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "awaiting_transcription" });
  });

  test("renovar estende o lease e guarda o progresso no job", async () => {
    const { created, reservation } = await reserved();

    const renewed = await worker.renew(
      { requestId: created.requestId, leaseToken: reservation.leaseToken, stage: "transcription", percent: 30 },
      actor,
    );

    expect(Date.parse(renewed.leaseExpiresAt)).toBeGreaterThan(Date.now());
    expect(await selectRows(ctx.pool, "SELECT progress FROM jobs WHERE task_id = $1", [created.requestId])).toEqual([
      { progress: { stage: "transcription", percent: 30 } },
    ]);
  });

  test("a entrega com resultado grava a entrada, leva o pedido a running, fecha o job e enfileira a formatacao", async () => {
    const { created, reservation } = await reserved();

    const result = await worker.deliver(
      { requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT },
      actor,
    );

    expect(result).toEqual({ requestId: created.requestId, status: "running" });
    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "running" });
    expect(await selectRows(ctx.pool, "SELECT kind, role, content, data FROM task_entries WHERE task_id = $1", [created.requestId])).toEqual([
      { kind: "input", role: null, content: null, data: { type: "transcription", ...RESULT } },
    ]);
    expect(await selectRows(ctx.pool, "SELECT kind, status, task_id FROM jobs ORDER BY kind")).toEqual([
      { kind: TRANSCRIPTION_JOB, status: "succeeded", task_id: created.requestId },
      { kind: TRANSCRIPTION_FORMAT_JOB, status: "queued", task_id: created.requestId },
    ]);
    const body = (await artifacts.findById(created.artifactId))?.data as { body: string };
    expect(body.body).toContain("Transcrição na fila");
  });

  test("a entrega com falha leva o pedido a failed, escreve o motivo no documento e devolve a leitura para a fazer", async () => {
    const { created, reservation } = await reserved();
    await ctx.pool.query("UPDATE tasks SET status = 'done', finished_at = now() WHERE id = $1", [created.taskId]);

    const result = await worker.deliver(
      { requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "private" },
      actor,
    );

    expect(result).toEqual({ requestId: created.requestId, status: "failed", code: "private" });
    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "failed", data: { failureCode: "private" } });
    expect((await tasks.findById(created.requestId))?.finishedAt).toBeInstanceOf(Date);
    const body = (await artifacts.findById(created.artifactId))?.data as { body: string };
    expect(body.body).toContain("Transcrição indisponível: o vídeo é privado.");
    const reading = await tasks.findById(created.taskId);
    expect(reading).toMatchObject({ status: "todo" });
    expect(reading?.finishedAt).toBeUndefined();
    expect(await selectRows(ctx.pool, "SELECT status FROM jobs")).toEqual([{ status: "succeeded" }]);
  });

  test("com o lease de outro, a entrega nao grava nada", async () => {
    const { created, reservation } = await reserved();

    await expect(
      worker.deliver({ requestId: created.requestId, leaseToken: "outro", outcome: "completed", result: RESULT }, actor),
    ).rejects.toThrow(/lease/i);
    await expect(
      worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, { userId: OTHER_USER }),
    ).rejects.toThrow(/lease/i);

    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "awaiting_transcription" });
    expect(await countRows(ctx.pool, "task_entries")).toBe(0);
    expect(await selectRows(ctx.pool, "SELECT kind, status FROM jobs")).toEqual([{ kind: TRANSCRIPTION_JOB, status: "running" }]);
  });
});
