import type { TranscriptionResult } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ArtifactBuilder } from "../../../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../../../api-core/tasks/create-task.usecase";
import { TRANSCRIPTION_FORMAT_JOB, TRANSCRIPTION_JOB, TRANSCRIPTION_MAX_ATTEMPTS } from "../../../api-core/transcription/transcription-requests";
import { FastStageError } from "../../../api-core/agent/errors/agent.errors";
import { CancelTranscriptionUseCase } from "../../../features/request-transcription/cancel-transcription.usecase";
import { FormatTranscriptionUseCase } from "../../../features/format-transcription/format-transcription.usecase";
import { RequestTranscriptionUseCase } from "../../../features/request-transcription/request-transcription.usecase";
import { DailyReadingGate } from "../../../api-core/tasks/daily-reading.gate";
import { TranscriptionWorkerUseCase } from "../../../api-core/transcription/transcription-worker.usecase";
import { SqliteEntityBatchWriter } from "../agent-batch/sqlite-entity-batch-writer";
import { SqliteWorkoutCatalog } from "../artifacts/sqlite-workout.catalog";
import { SqliteArtifactRepository } from "../artifacts/repositories/sqlite-artifact.repository";
import { SqliteTaskCardQuery } from "../tasks/queries/sqlite-task-card.query";
import { SqliteTaskRelations } from "../tasks/relations/sqlite-task-relations";
import { SqliteTaskRepository } from "../tasks/repositories/sqlite-task.repository";
import { OTHER_USER, USER, countRows, selectRows } from "../testing/fixtures";
import { sql } from "@repo/sqlite";
import { createSqliteTestContext, type SqliteTestContext } from "../testing/sqlite-test-context";
import { SqliteTranscriptionRequests } from "./sqlite-transcription-requests";

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

describe("servico local de transcricao no SQLite", () => {
  let ctx: SqliteTestContext;
  let tasks: SqliteTaskRepository;
  let artifacts: SqliteArtifactRepository;
  let request: RequestTranscriptionUseCase;
  let worker: TranscriptionWorkerUseCase;
  let requestsStore: SqliteTranscriptionRequests;
  let gate: DailyReadingGate;

  beforeAll(async () => {
    ctx = await createSqliteTestContext();
    tasks = new SqliteTaskRepository(ctx.db);
    artifacts = new SqliteArtifactRepository(ctx.db);
    const builder = new ArtifactBuilder(new SqliteWorkoutCatalog(ctx.db));
    const writer = new SqliteEntityBatchWriter(ctx.db);
    const createTask = new CreateTaskUseCase(tasks, artifacts, builder, writer, () => now);
    gate = new DailyReadingGate(new SqliteTaskCardQuery(ctx.db), artifacts, builder, createTask, writer, undefined, () => now);
    const requests = new SqliteTranscriptionRequests(ctx.db);
    requestsStore = requests;
    request = new RequestTranscriptionUseCase(gate, requests, new SqliteTaskRelations());
    worker = new TranscriptionWorkerUseCase(gate, writer, requests, () => now);
  }, 60000);

  /** SQL de escrita dos testes, com `$1`, `$2`... no lugar dos valores. */
  const exec = (text: string, params: unknown[] = []) => ctx.db.execute(sql.unsafe(text, params));

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  /** As entradas de tarefa, com o `data` (JSON em texto no SQLite) ja decodificado. */
  async function entriesOf(text: string, params: unknown[] = []) {
    return (await selectRows(ctx.db, text, params)).map((row) => ({ ...row, data: JSON.parse(String(row.data)) }));
  }

  async function reserved() {
    const created = await request.execute({ url: VIDEO }, actor);
    const reservation = await worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    return { created, reservation };
  }

  test("reserva so o job da transcricao, so o da pessoa, e so um por vez", async () => {
    await exec(
      `INSERT INTO jobs (id, kind, user_id, actor_id, payload) VALUES ('01J00000000000000000000000', 'work', $1, $1, '{}')`,
      [USER],
    );
    const other = await request.execute({ url: VIDEO }, { userId: OTHER_USER });
    const mine = await request.execute({ url: "https://www.youtube.com/shorts/abcdefghijk" }, actor);

    const reservation = await worker.reserve(actor);

    expect(reservation).toMatchObject({ requestId: mine.requestId, url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(await worker.reserve(actor)).toBeUndefined();
    expect(await selectRows(ctx.db, "SELECT kind, status FROM jobs WHERE task_id = $1", [other.requestId])).toEqual([
      { kind: TRANSCRIPTION_JOB, status: "queued" },
    ]);
    expect(await selectRows(ctx.db, "SELECT status FROM jobs WHERE kind = 'work'")).toEqual([{ status: "queued" }]);
  });

  test("o lease vencido devolve o job para a fila e o lease velho perde o direito", async () => {
    const { created, reservation } = await reserved();
    await exec("UPDATE jobs SET lease_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 second') WHERE task_id = $1", [created.requestId]);

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

  test("depois da quinta reserva vencida o pedido falha em vez de voltar à fila, e a leitura volta para a fazer", async () => {
    const created = await request.execute({ url: VIDEO }, actor);
    await exec("UPDATE tasks SET status = 'done', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [created.taskId]);
    for (let attempt = 1; attempt <= TRANSCRIPTION_MAX_ATTEMPTS; attempt++) {
      expect(await worker.reserve(actor), `reserva ${attempt}`).toMatchObject({ requestId: created.requestId });
      await exec("UPDATE jobs SET lease_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 second') WHERE task_id = $1", [created.requestId]);
    }

    expect(await worker.reserve(actor)).toBeUndefined();

    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "failed", data: { failureCode: "failed" } });
    const body = (await artifacts.findById(created.artifactId))?.data as { body: string };
    expect(body.body).toContain("Transcrição indisponível: a transcrição falhou.");
    expect(await tasks.findById(created.taskId)).toMatchObject({ status: "todo" });
    expect(await selectRows(ctx.db, "SELECT status FROM jobs")).toEqual([{ status: "succeeded" }]);
  });

  test("cancelar o pedido na fila cancela o job, o documento diz que foi cancelado e a leitura volta para a fazer", async () => {
    const created = await request.execute({ url: VIDEO }, actor);
    const reservation = await worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    await exec("UPDATE tasks SET status = 'done', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [created.taskId]);

    expect(await new CancelTranscriptionUseCase(gate, requestsStore, { cancelOfTasks: async () => {} }, () => now).execute(created.requestId, actor)).toBe(true);

    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "cancelled", data: { errorCode: "cancelled" } });
    expect(await selectRows(ctx.db, "SELECT kind, status FROM jobs")).toEqual([{ kind: TRANSCRIPTION_JOB, status: "cancelled" }]);
    const body = (await artifacts.findById(created.artifactId))?.data as { body: string };
    expect(body.body).toBe(`Fonte: [YouTube](${VIDEO})\n\nTranscrição cancelada\n`);
    expect(await tasks.findById(created.taskId)).toMatchObject({ status: "todo" });
    await expect(
      worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor),
    ).rejects.toThrow(/lease/i);
    expect(await worker.reserve(actor)).toBeUndefined();
  });

  test("renovar estende o lease e guarda o progresso no job", async () => {
    const { created, reservation } = await reserved();

    const renewed = await worker.renew(
      { requestId: created.requestId, leaseToken: reservation.leaseToken, stage: "transcription", percent: 30 },
      actor,
    );

    expect(Date.parse(renewed.leaseExpiresAt)).toBeGreaterThan(Date.now());
    const [job] = await selectRows(ctx.db, "SELECT progress FROM jobs WHERE task_id = $1", [created.requestId]);
    expect(JSON.parse(String(job.progress))).toEqual({ stage: "transcription", percent: 30 });
  });

  test("a entrega com resultado grava a entrada, leva o pedido a running, fecha o job e enfileira a formatacao", async () => {
    const { created, reservation } = await reserved();

    const result = await worker.deliver(
      { requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT },
      actor,
    );

    expect(result).toEqual({ requestId: created.requestId, status: "running" });
    expect(await tasks.findById(created.requestId)).toMatchObject({ status: "running" });
    expect(await entriesOf("SELECT kind, role, content, data FROM task_entries WHERE task_id = $1", [created.requestId])).toEqual([
      { kind: "input", role: null, content: null, data: { type: "transcription", ...RESULT } },
    ]);
    expect(await selectRows(ctx.db, "SELECT kind, status, task_id FROM jobs ORDER BY kind")).toEqual([
      { kind: TRANSCRIPTION_JOB, status: "succeeded", task_id: created.requestId },
      { kind: TRANSCRIPTION_FORMAT_JOB, status: "queued", task_id: created.requestId },
    ]);
    const body = (await artifacts.findById(created.artifactId))?.data as { body: string };
    expect(body.body).toContain("Transcrição na fila");
  });

  test("a entrega com falha leva o pedido a failed, escreve o motivo no documento e devolve a leitura para a fazer", async () => {
    const { created, reservation } = await reserved();
    await exec("UPDATE tasks SET status = 'done', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [created.taskId]);

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
    expect(await selectRows(ctx.db, "SELECT status FROM jobs")).toEqual([{ status: "succeeded" }]);
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
    expect(await countRows(ctx.db, "task_entries")).toBe(0);
    expect(await selectRows(ctx.db, "SELECT kind, status FROM jobs")).toEqual([{ kind: TRANSCRIPTION_JOB, status: "running" }]);
  });

  describe("formatacao do resultado entregue", () => {
    const bodyOf = async (artifactId: string): Promise<string> => {
      const artifact = await artifacts.findById(artifactId);
      return ((artifact as { data: { body: string } }).data).body;
    };
    const format = { speakers: [{ label: "Falante 1", name: "Ana" }], topics: [{ title: "Abertura", summary: "Começo.", startSegment: 0, minute: 0 }], hotMoments: [] };
    const haiku = (comments: unknown | Error) => ({
      complete: async (input: { schemaName: string }) => {
        const value = input.schemaName === "transcription_format" ? format : comments;
        if (value instanceof Error) throw value;
        return { value, modelName: "claude-haiku-5-5" };
      },
    });

    async function deliveredRequest(result: TranscriptionResult = { ...RESULT, comments: [{ author: "ana", text: "Bom", likes: 1, publishedAt: "2026-08-16T10:00:00Z" }] }) {
      const { created, reservation } = await reserved();
      await exec("UPDATE tasks SET status = 'done', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [created.taskId]);
      await worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result }, actor);
      return created;
    }

    test("monta o documento, leva o pedido a completed e a leitura de volta para a fazer", async () => {
      const created = await deliveredRequest();

      await new FormatTranscriptionUseCase(gate, requestsStore, haiku({ summary: "Gostaram." }), () => now).run(created.requestId, USER);

      const request = await tasks.findById(created.requestId);
      expect(request).toMatchObject({ status: "completed" });
      expect(request?.finishedAt).toBeInstanceOf(Date);
      const artifact = await artifacts.findById(created.artifactId);
      expect(artifact?.name).toBe("Entrevista");
      const body = await bodyOf(created.artifactId);
      expect(body).toContain("## Resumo\n- [Abertura](#t-0) (00:00): Começo.");
      expect(body).toContain("## Comentários\nGostaram.");
      expect(body).toContain("{#t-0} [00:00](https://youtu.be/dQw4w9WgXcQ?t=0) **Ana:** Olá, tudo bem?");
      expect(await tasks.findById(created.taskId)).toMatchObject({ status: "todo" });
      expect(await countRows(ctx.db, "task_entries", "kind = 'trace'")).toBe(0);
    });

    test("com o documento apagado antes da formatação, nasce outro e o pedido passa a apontar para ele", async () => {
      const created = await deliveredRequest();
      await artifacts.delete(created.artifactId, USER);

      await new FormatTranscriptionUseCase(gate, requestsStore, haiku({ summary: "Gostaram." }), () => now).run(created.requestId, USER);

      const request = await tasks.findById(created.requestId);
      const { artifactId } = (request?.data ?? {}) as { artifactId: string };
      expect(request).toMatchObject({ status: "completed" });
      expect(artifactId).not.toBe(created.artifactId);
      expect(await bodyOf(artifactId)).toContain("## Transcrição");
      expect(await countRows(ctx.db, "artifacts", "type = 'text' AND deleted_at IS NULL")).toBe(1);
      expect((await tasks.findById(created.taskId))?.artifactLinks.map((link) => link.artifactId)).toContain(artifactId);
    });

    test("com falha só nos comentários, o pedido termina completed e ganha a entrada", async () => {
      const created = await deliveredRequest();

      await new FormatTranscriptionUseCase(gate, requestsStore, haiku(new FastStageError("provider")), () => now).run(created.requestId, USER);

      expect(await tasks.findById(created.requestId)).toMatchObject({ status: "completed" });
      expect(await bodyOf(created.artifactId)).not.toContain("## Comentários");
      expect(await entriesOf("SELECT kind, data FROM task_entries WHERE kind = 'trace'")).toEqual([
        { kind: "trace", data: { stage: "comments_summary", status: "failed" } },
      ]);
    });

    test("com o Haiku fora do ar, o pedido termina failed com o motivo, e rodar de novo não muda nada", async () => {
      const created = await deliveredRequest();
      const down = { complete: () => Promise.reject(new FastStageError("timeout")) };
      const useCase = new FormatTranscriptionUseCase(gate, requestsStore, down, () => now);

      await useCase.run(created.requestId, USER);
      await useCase.run(created.requestId, USER);

      expect(await tasks.findById(created.requestId)).toMatchObject({ status: "failed", data: { failureCode: "failed" } });
      expect(await bodyOf(created.artifactId)).toContain("a formatação do resultado falhou.");
      expect(await tasks.findById(created.taskId)).toMatchObject({ status: "todo" });
    });

    test("pedido de outra pessoa ou ainda na fila não é formatado", async () => {
      const created = await deliveredRequest();
      const useCase = new FormatTranscriptionUseCase(gate, requestsStore, haiku({ summary: "x" }), () => now);

      await useCase.run(created.requestId, OTHER_USER);

      expect(await tasks.findById(created.requestId)).toMatchObject({ status: "running" });
      expect(await requestsStore.awaitingFormat(USER, created.requestId)).toMatchObject({ data: { videoId: "dQw4w9WgXcQ" }, result: { video: { title: "Entrevista" } } });
      expect(await requestsStore.awaitingFormat(OTHER_USER, created.requestId)).toBeUndefined();
    });
  });
});
