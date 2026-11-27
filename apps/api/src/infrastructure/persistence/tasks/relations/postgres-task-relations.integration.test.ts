import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ArtifactBuilder } from "../../../../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../../../../api-core/tasks/create-task.usecase";
import { DailyReadingGate } from "../../../../api-core/tasks/daily-reading.gate";
import { SaveDailyReadingUseCase } from "../../../../features/save-daily-reading/save-daily-reading.usecase";
import { PostgresEntityBatchWriter } from "../../agent-batch/postgres-entity-batch-writer";
import { PostgresWorkoutCatalog } from "../../artifacts/postgres-workout.catalog";
import { PostgresArtifactRepository } from "../../artifacts/repositories/postgres-artifact.repository";
import { USER, selectRows } from "../../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../../testing/postgres-test-context";
import { PostgresTaskCardQuery } from "../queries/postgres-task-card.query";
import { PostgresTaskRepository } from "../repositories/postgres-task.repository";
import { PostgresTaskRelations } from "./postgres-task-relations";

// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
const page = { url: "https://jornal.example/juros", title: "Juros caem", markdown: "O comitê cortou a taxa." };

describe("guardar página na Leitura diária no Postgres", () => {
  let ctx: PostgresTestContext;
  let useCase: SaveDailyReadingUseCase;
  let tasks: PostgresTaskRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    tasks = new PostgresTaskRepository(ctx.db);
    const artifacts = new PostgresArtifactRepository(ctx.db);
    const builder = new ArtifactBuilder(new PostgresWorkoutCatalog(ctx.db));
    const writer = new PostgresEntityBatchWriter(ctx.db);
    const createTask = new CreateTaskUseCase(tasks, artifacts, builder, writer, () => now);
    const gate = new DailyReadingGate(new PostgresTaskCardQuery(ctx.db), artifacts, builder, createTask, writer, undefined, () => now);
    useCase = new SaveDailyReadingUseCase(gate, new PostgresTaskRelations());
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  test("o save_content, o artefato, a leitura e a relação entram juntos, e guardar de novo atualiza", async () => {
    const first = await useCase.execute(page, { userId: USER });

    const saves = await selectRows<{ id: string }>(ctx.pool, "SELECT id FROM tasks WHERE kind = 'save_content'");
    expect(saves).toHaveLength(1);
    expect(await tasks.findById(saves[0]?.id as string)).toMatchObject({
      actor: "agent",
      status: "done",
      artifactLinks: [{ artifactId: first.artifactId, relation: "creates" }],
    });
    expect(await selectRows(ctx.pool, "SELECT from_task_id, to_task_id, relation FROM task_task_relation")).toEqual([
      { from_task_id: saves[0]?.id, to_task_id: first.taskId, relation: "generates" },
    ]);

    const second = await useCase.execute({ ...page, markdown: "Texto atualizado." }, { userId: USER });

    expect(second).toMatchObject({ taskId: first.taskId, artifactId: first.artifactId, artifactCreated: false });
    const relations = await selectRows(ctx.pool, "SELECT relation FROM task_task_relation ORDER BY relation");
    expect(relations).toEqual([{ relation: "generates" }, { relation: "updates" }]);
  });
});
