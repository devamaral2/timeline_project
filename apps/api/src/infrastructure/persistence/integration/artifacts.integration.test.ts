import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  type ArtifactLink,
  type FoodData,
  type WorkoutCode,
} from "../../../domain";
import type { FoodGenerationPayload } from "../../../domain/ports";
import { jobContext } from "../../jobs/job-context";
import { PostgresWorkoutCatalog } from "../artifacts/postgres-workout.catalog";
import { PostgresArtifactTaskLinkQuery } from "../artifacts/queries/postgres-artifact-task-link.query";
import { FOOD_GENERATION_JOB } from "../artifacts/repositories/food-generation";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../database/postgres-database";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { PostgresJobStore } from "../jobs/postgres-job.store";
import {
  GLOBAL_WORKOUT_ID,
  OTHER_USER,
  USER,
  agentTask,
  at,
  countRows,
  foodArtifact,
  foodData,
  pendingFoodData,
  referenceTask,
  selectRows,
  textArtifact,
  trackedTask,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const link = (artifactId: string, relation: ArtifactLink["relation"] = "uses"): ArtifactLink => ({
  artifactId,
  relation,
  fromRecurrence: false,
});

/** O que o calculo devolve: os nutrientes, a receita e a geracao concluida. */
function generatedFood(description: string, status: "completed" | "failed" = "completed"): FoodData {
  return foodData(640, {
    description,
    generation: { status },
    nutritionSource: "model-estimate",
    recipe: { source: "model", ingredients: [{ name: "feijao preto", quantity: "300 g" }], steps: ["Cozinhar tudo junto."] },
  });
}

describe("PostgresArtifactRepository", () => {
  let ctx: PostgresTestContext;
  let artifacts: PostgresArtifactRepository;
  let tasks: PostgresTaskRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    artifacts = new PostgresArtifactRepository(ctx.db);
    tasks = new PostgresTaskRepository(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function saved(artifact: Artifact): Promise<Artifact> {
    await artifacts.save(artifact);
    return artifact;
  }

  async function found(artifactId: string): Promise<Artifact> {
    const artifact = await artifacts.findById(artifactId);
    if (!artifact) throw new Error(`Artefato ${artifactId} nao foi encontrado`);
    return artifact;
  }

  describe("gravar e ler de volta", () => {
    test("texto volta com o nome tirado da primeira linha, as tags e a revisao 1", async () => {
      const note = await saved(textArtifact(USER, "Lista do mercado\n- arroz\n- feijao", ["Casa", "compras"]));

      const read = await found(note.id);

      expect(read).toMatchObject({
        id: note.id,
        userId: USER,
        name: "Lista do mercado",
        type: "text",
        schemaVersion: 1,
        derived: false,
        revision: 1,
        isGlobal: false,
      });
      expect(read.data).toEqual({ body: "Lista do mercado\n- arroz\n- feijao" });
      expect([...read.tags].sort()).toEqual(["casa", "compras"]);
    });

    test("alimento, sono e treino voltam com a data do tipo", async () => {
      const food = await saved(foodArtifact(USER, "Marmita", 520));
      const sleep = await saved(Artifact.create({ userId: USER, type: "sleep", data: { trackedSleepTime: 430, score: 82 } }));
      const training = await saved(
        Artifact.create({
          userId: USER,
          type: "training",
          data: {
            workouts: [{ workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 6, distance: 5 }],
            caloriesBurned: 300,
          },
        }),
      );

      expect((await found(food.id)).data).toEqual(foodData(520));
      expect(await found(sleep.id)).toMatchObject({ name: "Sono", data: { trackedSleepTime: 430, score: 82 } });
      expect(await found(training.id)).toMatchObject({ name: "Treino", data: training.data });
    });

    test("findByIds deixa de fora os ids ausentes e os artefatos apagados", async () => {
      const kept = await saved(textArtifact(USER, "fica"));
      const removed = await saved(textArtifact(USER, "sai"));
      await artifacts.delete(removed.id, USER);

      const read = await artifacts.findByIds([removed.id, kept.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]);

      expect(read.map((artifact) => artifact.id)).toEqual([kept.id]);
      expect(await artifacts.findByIds([])).toEqual([]);
    });
  });

  describe("editar e apagar", () => {
    test("grava o conteudo novo, troca as tags e incrementa a revisao", async () => {
      const note = await saved(textArtifact(USER, "rascunho", ["casa"]));

      await artifacts.update(note.revise({ name: "Versao final", data: { body: "pronto" }, tags: ["trabalho"] }), USER, 1);

      const read = await found(note.id);
      expect(read).toMatchObject({ name: "Versao final", data: { body: "pronto" }, tags: ["trabalho"], revision: 2 });
      expect(await countRows(ctx.pool, "artifact_tags", "artifact_id = $1", [note.id])).toBe(1);
    });

    test("trocar o tipo grava a data do tipo novo", async () => {
      const note = await saved(textArtifact(USER, "dormi bem"));

      await artifacts.update(note.revise({ type: "sleep", data: { trackedSleepTime: 480, score: 90 } }), USER, 1);

      expect(await found(note.id)).toMatchObject({ type: "sleep", data: { trackedSleepTime: 480, score: 90 } });
    });

    test("revisao desatualizada e conflito", async () => {
      const note = await saved(textArtifact(USER, "rascunho"));
      await artifacts.update(note.revise({ data: { body: "primeira edicao" } }), USER, 1);

      await expect(artifacts.update(note.revise({ data: { body: "edicao atrasada" } }), USER, 1)).rejects.toThrow(
        ArtifactRevisionConflictError,
      );
      expect((await found(note.id)).data).toEqual({ body: "primeira edicao" });
    });

    test("outro usuario nao edita nem apaga", async () => {
      const note = await saved(textArtifact(USER, "meu", ["casa"]));

      await expect(artifacts.update(note.revise({ data: { body: "invadido" } }), OTHER_USER, 1)).rejects.toThrow(
        ArtifactOwnershipError,
      );
      await expect(artifacts.delete(note.id, OTHER_USER)).rejects.toThrow(ArtifactOwnershipError);

      expect(await found(note.id)).toMatchObject({ data: { body: "meu" }, tags: ["casa"], revision: 1 });
    });

    test("apagar esconde o artefato, guarda a linha e nao deixa editar depois", async () => {
      const note = await saved(textArtifact(USER, "some"));

      await artifacts.delete(note.id, USER);

      expect(await artifacts.findById(note.id)).toBeNull();
      const [row] = await selectRows(ctx.pool, "SELECT deleted_at FROM artifacts WHERE id = $1", [note.id]);
      expect(row.deleted_at).toBeInstanceOf(Date);
      await expect(artifacts.update(note.revise({ data: { body: "tarde demais" } }), USER, 1)).rejects.toThrow(
        ArtifactNotFoundError,
      );
      await expect(artifacts.delete(note.id, USER)).rejects.toThrow(ArtifactNotFoundError);
    });

    test("um artefato global nao e editado nem apagado por um usuario", async () => {
      const [global] = await artifacts.findByIds([GLOBAL_WORKOUT_ID]);
      expect(global.isGlobal).toBe(true);
      // O dominio ja recusa `revise` num artefato global; a linha e montada a mao para chegar ao repositorio.
      const forged = Artifact.rehydrate({
        id: global.id,
        name: "Corrida do usuario",
        type: "workout",
        schemaVersion: 1,
        data: global.data,
        revision: 2,
        createdAt: global.createdAt,
        updatedAt: new Date(),
      });

      await expect(artifacts.update(forged, USER, 1)).rejects.toThrow(ArtifactOwnershipError);
      await expect(artifacts.delete(global.id, USER)).rejects.toThrow(ArtifactOwnershipError);

      expect(await found(GLOBAL_WORKOUT_ID)).toMatchObject({ name: "Corrida", revision: 1 });
    });
  });

  describe("listas", () => {
    test("listByUserId traz os do usuario, do editado mais recentemente ao mais antigo, sem copias nem apagados", async () => {
      const oldest = await saved(textArtifact(USER, "mais antigo"));
      const newest = await saved(foodArtifact(USER, "Marmita", 500));
      const middle = await saved(textArtifact(USER, "do meio"));
      const copy = await saved(newest.copyForTask(USER, "meia porcao"));
      const removed = await saved(textArtifact(USER, "apagado"));
      await artifacts.delete(removed.id, USER);
      await saved(textArtifact(OTHER_USER, "do outro"));
      for (const [id, updatedAt] of [
        [oldest.id, "2026-11-01T10:00:00Z"],
        [middle.id, "2026-11-02T10:00:00Z"],
        [newest.id, "2026-11-03T10:00:00Z"],
        [copy.id, "2026-11-04T10:00:00Z"],
      ]) {
        await ctx.pool.query("UPDATE artifacts SET updated_at = $2 WHERE id = $1", [id, updatedAt]);
      }

      const listed = await artifacts.listByUserId(USER);

      expect(listed.map((artifact) => artifact.id)).toEqual([newest.id, middle.id, oldest.id]);
      // A copia existe e e do usuario, so nao entra na lista.
      expect(await found(copy.id)).toMatchObject({ derived: true, data: { quantity: "meia porcao" } });
    });

    test("listByUserId filtra por tipo", async () => {
      const note = await saved(textArtifact(USER, "nota"));
      const food = await saved(foodArtifact(USER, "Marmita", 500));
      const sleep = await saved(Artifact.create({ userId: USER, type: "sleep", data: { trackedSleepTime: 400, score: 70 } }));

      const ids = async (types: string[]) => (await artifacts.listByUserId(USER, { types })).map((artifact) => artifact.id).sort();

      expect(await ids(["food"])).toEqual([food.id]);
      expect(await ids(["food", "sleep"])).toEqual([food.id, sleep.id].sort());
      // Lista de tipos vazia e o mesmo que nao filtrar.
      expect(await ids([])).toEqual([note.id, food.id, sleep.id].sort());
    });

    test("listGlobal traz os globais do tipo, por nome", async () => {
      await saved(Artifact.create({ type: "food", name: "Banana", data: foodData(90) }));
      await saved(Artifact.create({ type: "food", name: "Abacate", data: foodData(160) }));
      await saved(foodArtifact(USER, "Marmita do usuario", 500));

      expect((await artifacts.listGlobal("food")).map((artifact) => artifact.name)).toEqual(["Abacate", "Banana"]);
      expect((await artifacts.listGlobal("workout")).map((artifact) => artifact.name)).toEqual([
        "Caminhada",
        "Corrida",
        "Esteira",
        "Livre",
        "Musculação",
      ]);
      expect((await artifacts.listByUserId(USER)).map((artifact) => artifact.name)).toEqual(["Marmita do usuario"]);
    });
  });

  describe("alimento a espera dos nutrientes", () => {
    async function pendingFood(): Promise<{ food: Artifact; payload: FoodGenerationPayload; requestId: string }> {
      const food = await saved(Artifact.create({ userId: USER, type: "food", name: "Feijoada", data: pendingFoodData("feijoada completa") }));
      const [job] = await selectRows<{ payload: FoodGenerationPayload; task_id: string }>(
        ctx.pool,
        "SELECT payload, task_id FROM jobs WHERE kind = $1",
        [FOOD_GENERATION_JOB],
      );
      return { food, payload: job.payload, requestId: job.task_id };
    }

    const requestOf = async (requestId: string) =>
      (await selectRows(ctx.pool, "SELECT status, situation, finished_at FROM tasks WHERE id = $1", [requestId]))[0];
    const resultsOf = (requestId: string) =>
      selectRows(ctx.pool, "SELECT kind, role, content, data FROM task_entries WHERE task_id = $1 AND kind = 'result'", [requestId]);

    test("inserir abre o pedido de construcao, a relacao, a mensagem e o job", async () => {
      const { food } = await pendingFood();

      const requests = await selectRows(ctx.pool, "SELECT * FROM tasks");
      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request).toMatchObject({
        user_id: USER,
        actor: "agent",
        kind: "build_request",
        status: "queued",
        name: "Calcular os nutrientes de Feijoada",
        data: { route: "food" },
        finished_at: null,
      });
      expect(request.started_at).toBeInstanceOf(Date);

      expect(await selectRows(ctx.pool, "SELECT task_id, artifact_id, relation, position FROM task_artifact_relation")).toEqual([
        { task_id: request.id, artifact_id: food.id, relation: "updates", position: null },
      ]);
      expect(await selectRows(ctx.pool, "SELECT task_id, user_id, kind, role, content FROM task_entries")).toEqual([
        { task_id: request.id, user_id: USER, kind: "message", role: "user", content: "feijoada completa" },
      ]);
      expect(
        await selectRows(ctx.pool, "SELECT kind, user_id, actor_id, task_id, dedupe_key, status, payload FROM jobs"),
      ).toEqual([
        {
          kind: "food-generation",
          user_id: USER,
          actor_id: USER,
          task_id: request.id,
          dedupe_key: food.id,
          status: "queued",
          payload: {
            artifactId: food.id,
            userId: USER,
            expectedRevision: 1,
            description: "feijoada completa",
            name: "Feijoada",
          },
        },
      ]);
    });

    test("alimento com os nutrientes ja informados nao abre pedido nem job", async () => {
      await saved(foodArtifact(USER, "Marmita", 500));
      await saved(Artifact.create({ type: "food", name: "Global pendente", data: pendingFoodData("sem dono") }));

      expect(await countRows(ctx.pool, "tasks")).toBe(0);
      expect(await countRows(ctx.pool, "jobs")).toBe(0);
    });

    test("o alimento pendente que nasce com uma tarefa abre o pedido na mesma transacao", async () => {
      const food = Artifact.create({ userId: USER, type: "food", name: "Feijoada", data: pendingFoodData("feijoada") });
      const meal = referenceTask(USER, "Almoco", "2026-11-10T15:00:00Z", { kind: "meal", artifactLinks: [link(food.id, "creates")] });

      await tasks.save(meal, { created: [food] });

      expect(await countRows(ctx.pool, "tasks", "actor = 'agent' AND kind = 'build_request'")).toBe(1);
      expect(await countRows(ctx.pool, "jobs", "kind = $1", [FOOD_GENERATION_JOB])).toBe(1);
    });

    test("concluir grava os nutrientes, encerra o pedido como done e acrescenta o resultado", async () => {
      const { food, payload, requestId } = await pendingFood();

      const applied = await artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa"), "completed");

      expect(applied).toBe(true);
      const read = await found(food.id);
      expect(read.revision).toBe(2);
      expect(read.data).toMatchObject({
        generation: { status: "completed" },
        nutritionSource: "model-estimate",
        totals: { totalCaloriesKcal: 640 },
      });
      const request = await requestOf(requestId);
      expect(request.status).toBe("completed");
      expect(request.situation).toBe("to_review");
      expect(request.finished_at).toBeInstanceOf(Date);
      expect(await resultsOf(requestId)).toEqual([
        { kind: "result", role: null, content: null, data: { outcome: "completed", artifactId: food.id } },
      ]);
    });

    test("uma geracao que falhou marca o alimento e encerra o pedido como failed", async () => {
      const { food, payload, requestId } = await pendingFood();

      const applied = await artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa", "failed"), "failed");

      expect(applied).toBe(true);
      expect((await found(food.id)).data).toMatchObject({ generation: { status: "failed" } });
      expect(await requestOf(requestId)).toMatchObject({ status: "failed", situation: "to_review" });
      expect((await resultsOf(requestId)).map((entry) => entry.data)).toEqual([{ outcome: "failed", artifactId: food.id }]);
    });

    test("nao aplica se a revisao, a descricao ou o nome mudaram desde o pedido", async () => {
      const stale: Array<[string, (payload: FoodGenerationPayload) => FoodGenerationPayload]> = [
        ["revisao", (payload) => ({ ...payload, expectedRevision: 2 })],
        ["descricao", (payload) => ({ ...payload, description: "outra descricao" })],
        ["nome", (payload) => ({ ...payload, name: "Outro nome" })],
      ];
      for (const [what, change] of stale) {
        await ctx.reset();
        const { food, payload, requestId } = await pendingFood();

        const applied = await artifacts.finishFoodGeneration(change(payload), generatedFood("feijoada completa"), "completed");

        expect(applied, what).toBe(false);
        expect(await found(food.id), what).toMatchObject({ revision: 1, data: { generation: { status: "pending" } } });
        // O pedido termina mesmo assim: ninguem fica esperando, e o resultado diz que foi pulado.
        expect((await requestOf(requestId)).status, what).toBe("completed");
        expect((await resultsOf(requestId)).map((entry) => entry.data), what).toEqual([
          { outcome: "skipped", artifactId: food.id },
        ]);
      }
    });

    test("sem data, so registra que a geracao foi pulada", async () => {
      const { food, payload, requestId } = await pendingFood();

      expect(await artifacts.finishFoodGeneration(payload, null, "skipped")).toBe(false);

      expect((await found(food.id)).revision).toBe(1);
      expect((await requestOf(requestId)).status).toBe("completed");
      expect((await resultsOf(requestId)).map((entry) => entry.data)).toEqual([{ outcome: "skipped", artifactId: food.id }]);
    });

    test("um pedido ja encerrado nao ganha um segundo resultado", async () => {
      const { payload, requestId } = await pendingFood();
      await artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa"), "completed");

      expect(await artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa"), "completed")).toBe(false);

      expect(await resultsOf(requestId)).toHaveLength(1);
    });

    test("dentro do job, a escrita encerra o job na mesma transacao", async () => {
      const { payload } = await pendingFood();
      const store = new PostgresJobStore(new PostgresDatabase(ctx.pool), 3000, 3);
      const [job] = await store.claim([FOOD_GENERATION_JOB], 1);

      await jobContext.run({ id: job.id, token: job.leaseToken as string }, () =>
        artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa"), "completed"),
      );

      expect(await store.get(job.id)).toMatchObject({ status: "succeeded" });
    });

    test("com o lease perdido, nem o alimento nem o pedido mudam", async () => {
      const { food, payload, requestId } = await pendingFood();
      const store = new PostgresJobStore(new PostgresDatabase(ctx.pool), 3000, 3);
      const [job] = await store.claim([FOOD_GENERATION_JOB], 1);
      await ctx.pool.query("UPDATE jobs SET lease_token = 'outro-worker' WHERE id = $1", [job.id]);

      await expect(
        jobContext.run({ id: job.id, token: job.leaseToken as string }, () =>
          artifacts.finishFoodGeneration(payload, generatedFood("feijoada completa"), "completed"),
        ),
      ).rejects.toThrow(/lease lost/);

      expect(await found(food.id)).toMatchObject({ revision: 1, data: { generation: { status: "pending" } } });
      expect((await requestOf(requestId)).status).toBe("queued");
      expect(await resultsOf(requestId)).toEqual([]);
    });
  });

  describe("PostgresArtifactTaskLinkQuery", () => {
    test("lista as tarefas vivas de cada artefato, do mais antigo ao mais novo e os sem inicio no fim", async () => {
      const links = new PostgresArtifactTaskLinkQuery(ctx.db);
      const note = await saved(textArtifact(USER, "nota"));
      const lonely = await saved(textArtifact(USER, "sem tarefa"));
      const other = await saved(textArtifact(USER, "outra"));

      const late = referenceTask(USER, "Tarde", "2026-11-10T18:00:00Z", { artifactLinks: [link(note.id), link(other.id)] });
      const early = referenceTask(USER, "Cedo", "2026-11-10T08:00:00Z", { artifactLinks: [link(note.id, "creates")] });
      const noStart = trackedTask(USER, "Sem hora", { artifactLinks: [link(note.id)] });
      const removed = referenceTask(USER, "Apagado", "2026-11-10T09:00:00Z", { artifactLinks: [link(note.id)] });
      const request = agentTask(USER, "Pedido", { artifactLinks: [link(note.id, "updates")] });
      const step = agentTask(USER, "Passo", { kind: "step", status: "completed", artifactLinks: [link(note.id, "updates")] });
      for (const task of [late, early, noStart, removed, request, step]) await tasks.save(task);
      await tasks.delete(removed.id, USER);

      const found = await links.linksOf([note.id, lonely.id, other.id]);

      expect([...found.keys()].sort()).toEqual([note.id, other.id].sort());
      expect(found.get(note.id)).toEqual([
        {
          taskId: early.id,
          relation: "creates",
          name: "Cedo",
          actor: "human",
          kind: "common",
          startedAt: at("2026-11-10T08:00:00Z"),
          estimatedFinishAt: at("2026-11-10T09:00:00Z"),
        },
        {
          taskId: request.id,
          relation: "updates",
          name: "Pedido",
          actor: "agent",
          kind: "request",
          startedAt: at("2026-11-10T12:00:00Z"),
          estimatedFinishAt: undefined,
        },
        {
          taskId: late.id,
          relation: "uses",
          name: "Tarde",
          actor: "human",
          kind: "common",
          startedAt: at("2026-11-10T18:00:00Z"),
          estimatedFinishAt: at("2026-11-10T19:00:00Z"),
        },
        {
          taskId: noStart.id,
          relation: "uses",
          name: "Sem hora",
          actor: "human",
          kind: "common",
          startedAt: undefined,
          estimatedFinishAt: undefined,
        },
      ]);
      expect(found.get(other.id)?.map((entry) => entry.taskId)).toEqual([late.id]);
      expect(await links.linksOf([])).toEqual(new Map());
    });
  });

  describe("PostgresWorkoutCatalog", () => {
    test("le os exercicios globais da migration pelo codigo, na ordem pedida", async () => {
      const catalog = new PostgresWorkoutCatalog(ctx.db);

      expect(await catalog.findActiveByCodes(["weightlifting", "running", "weightlifting"])).toEqual([
        { code: "weightlifting", name: "Musculação", category: "strength", active: true },
        { code: "running", name: "Corrida", category: "cardio", active: true },
        { code: "weightlifting", name: "Musculação", category: "strength", active: true },
      ]);
      expect(await catalog.findActiveByCodes(["walking", "treadmill", "free"])).toHaveLength(3);
      expect(await catalog.findActiveByCodes([])).toEqual([]);
    });

    test("recusa codigo desconhecido, exercicio inativo e exercicio que nao e global", async () => {
      const catalog = new PostgresWorkoutCatalog(ctx.db);
      await saved(Artifact.create({ userId: USER, type: "workout", name: "Yoga", data: { code: "yoga", category: "free" } }));

      await expect(catalog.findActiveByCodes(["running", "swimming" as WorkoutCode])).rejects.toThrow(ArtifactValidationError);
      await expect(catalog.findActiveByCodes(["yoga" as WorkoutCode])).rejects.toThrow(/Unknown or inactive workout code: yoga/);

      // Os exercicios da migration sobrevivem ao reset: o que este teste muda, ele desfaz.
      await ctx.pool.query(`UPDATE artifacts SET data = data || '{"active": false}' WHERE data->>'code' = 'free' AND user_id IS NULL`);
      try {
        await expect(catalog.findActiveByCodes(["free"])).rejects.toThrow(/Unknown or inactive workout code: free/);
      } finally {
        await ctx.pool.query(`UPDATE artifacts SET data = data || '{"active": true}' WHERE data->>'code' = 'free' AND user_id IS NULL`);
      }
    });
  });
});
