import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ArtifactBuilder } from "../../../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../../../api-core/tasks/create-task.usecase";
import { TRANSCRIPTION_JOB } from "../../../api-core/transcription/transcription-requests";
import { DailyReadingGate } from "../../../api-core/tasks/daily-reading.gate";
import { SaveDailyReadingUseCase } from "../../../features/save-daily-reading/save-daily-reading.usecase";
import { RequestTranscriptionUseCase } from "../../../features/request-transcription/request-transcription.usecase";
import { SqliteEntityBatchWriter } from "../agent-batch/sqlite-entity-batch-writer";
import { SqliteWorkoutCatalog } from "../artifacts/sqlite-workout.catalog";
import { SqliteArtifactRepository } from "../artifacts/repositories/sqlite-artifact.repository";
import { SqliteTaskCardQuery } from "../tasks/queries/sqlite-task-card.query";
import { SqliteTaskRelations } from "../tasks/relations/sqlite-task-relations";
import { SqliteTaskRepository } from "../tasks/repositories/sqlite-task.repository";
import { USER, countRows, selectRows } from "../testing/fixtures";
import { sql } from "@repo/sqlite";
import { createSqliteTestContext, type SqliteTestContext } from "../testing/sqlite-test-context";
import { SqliteTranscriptionRequests } from "./sqlite-transcription-requests";

// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("pedido de transcricao no SQLite", () => {
  let ctx: SqliteTestContext;
  let useCase: RequestTranscriptionUseCase;
  let tasks: SqliteTaskRepository;
  let saveReading: SaveDailyReadingUseCase;

  beforeAll(async () => {
    ctx = await createSqliteTestContext();
    tasks = new SqliteTaskRepository(ctx.db);
    const artifacts = new SqliteArtifactRepository(ctx.db);
    const builder = new ArtifactBuilder(new SqliteWorkoutCatalog(ctx.db));
    const writer = new SqliteEntityBatchWriter(ctx.db);
    const createTask = new CreateTaskUseCase(tasks, artifacts, builder, writer, () => now);
    const gate = new DailyReadingGate(new SqliteTaskCardQuery(ctx.db), artifacts, builder, createTask, writer, undefined, () => now);
    useCase = new RequestTranscriptionUseCase(gate, new SqliteTranscriptionRequests(ctx.db), new SqliteTaskRelations());
    saveReading = new SaveDailyReadingUseCase(gate, new SqliteTaskRelations());
  }, 60000);

  /** SQL de escrita dos testes, com `$1`, `$2`... no lugar dos valores. */
  const exec = (text: string, params: unknown[] = []) => ctx.db.execute(sql.unsafe(text, params));

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  test("o pedido, o documento, a ligacao com a leitura e o job entram juntos, e o pedido repetido nao grava nada", async () => {
    const result = await useCase.execute({ url: VIDEO }, { userId: USER });

    expect(result.created).toBe(true);
    expect(await tasks.findById(result.requestId)).toMatchObject({
      actor: "agent",
      kind: "save_content_with_transcription",
      status: "awaiting_transcription",
      artifactLinks: [{ artifactId: result.artifactId, relation: "creates" }],
    });
    expect(await tasks.findById(result.taskId)).toMatchObject({ name: "Leitura diária", status: "todo" });
    expect(
      await selectRows(ctx.db, "SELECT from_task_id, to_task_id, relation FROM task_task_relation"),
    ).toEqual([{ from_task_id: result.requestId, to_task_id: result.taskId, relation: "generates" }]);
    expect(await selectRows(ctx.db, "SELECT kind, task_id, status, dedupe_key FROM jobs")).toEqual([
      { kind: TRANSCRIPTION_JOB, task_id: result.requestId, status: "queued", dedupe_key: result.requestId },
    ]);

    const again = await useCase.execute({ url: "https://youtu.be/dQw4w9WgXcQ" }, { userId: USER });

    expect(again).toEqual({ ...result, created: false });
    expect(await countRows(ctx.db, "jobs")).toBe(1);
    expect(await countRows(ctx.db, "tasks", "kind = 'save_content_with_transcription'")).toBe(1);
  });

  test("o pedido de transcricao, a tarefa de conteudo guardado e a leitura do dia caem no personal do dono, sem situacao", async () => {
    const video = await useCase.execute({ url: VIDEO }, { userId: USER });
    const page = await saveReading.execute({ url: "https://jornal.example/economia", title: "Juros", markdown: "Texto." }, { userId: USER });

    const projects = await selectRows(ctx.db, "SELECT id, name, personal FROM projects WHERE user_id = $1", [USER]);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: "diario", personal: 1 });
    const owned = await selectRows(ctx.db, "SELECT kind, project_id, situation FROM tasks WHERE user_id = $1 ORDER BY kind", [USER]);
    expect(owned.map((row) => row.kind)).toEqual(["common", "save_content", "save_content_with_transcription"]);
    for (const row of owned) {
      expect(row.project_id, String(row.kind)).toBe(projects[0].id);
      expect(row.situation, String(row.kind)).toBeNull();
    }
    expect(page.taskId).toBe(video.taskId);
  });

  test("com o pedido ja concluido, o proximo pedido atualiza o mesmo documento e a leitura relaciona 'updates'", async () => {
    const first = await useCase.execute({ url: VIDEO }, { userId: USER });
    await exec("UPDATE tasks SET status = 'completed', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [first.requestId]);
    await exec("UPDATE tasks SET status = 'done', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $1", [first.taskId]);

    const second = await useCase.execute({ url: VIDEO }, { userId: USER });

    expect(second).toMatchObject({ created: true, taskId: first.taskId, artifactId: first.artifactId });
    expect(await tasks.findById(first.taskId)).toMatchObject({ status: "todo" });
    expect(await countRows(ctx.db, "artifacts", "user_id = $1", [USER])).toBe(1);
    expect(
      await selectRows(ctx.db, "SELECT relation FROM task_task_relation WHERE from_task_id = $1", [second.requestId]),
    ).toEqual([{ relation: "updates" }]);
    expect(await countRows(ctx.db, "jobs")).toBe(2);
  });
});
