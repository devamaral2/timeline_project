import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Artifact, Task } from "../../../domain";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../database/postgres-database";
import { PostgresProjectQuery } from "../projects/postgres-project.query";
import { ensurePersonalProject } from "../projects/resolve-project";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import { PostgresRequestStore } from "../requests/postgres-request.store";
import { newOrderedId } from "../requests/request-rows";
import { PostgresTaskCardQuery } from "../tasks/queries/postgres-task-card.query";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import {
  OTHER_USER,
  USER,
  dailyRecurrence,
  occurrenceOf,
  pendingFoodData,
  selectRows,
  trackedTask,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

interface ProjectRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  personal: boolean;
}

describe("projetos", () => {
  let ctx: PostgresTestContext;
  let tasks: PostgresTaskRepository;
  let recurrences: PostgresRecurrenceRepository;
  let artifacts: PostgresArtifactRepository;
  let writer: PostgresEntityBatchWriter;
  let store: PostgresRequestStore;
  let query: PostgresProjectQuery;
  let cards: PostgresTaskCardQuery;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    tasks = new PostgresTaskRepository(ctx.db);
    recurrences = new PostgresRecurrenceRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
    writer = new PostgresEntityBatchWriter(ctx.db);
    store = new PostgresRequestStore(new PostgresDatabase(ctx.pool));
    query = new PostgresProjectQuery(ctx.db);
    cards = new PostgresTaskCardQuery(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  const projectsOf = (userId: string) =>
    selectRows<ProjectRow>(ctx.pool, "SELECT id, user_id, name, personal FROM projects WHERE user_id = $1 ORDER BY name", [userId]);

  /** O projeto em que cada tarefa ficou. */
  async function projectOfTask(taskId: string): Promise<ProjectRow> {
    const [row] = await selectRows<ProjectRow>(
      ctx.pool,
      "SELECT p.id, p.user_id, p.name, p.personal FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1",
      [taskId],
    );
    if (!row) throw new Error(`Tarefa ${taskId} sem projeto`);
    return row;
  }

  async function personalOf(userId: string): Promise<ProjectRow> {
    const [row] = (await projectsOf(userId)).filter((project) => project.personal);
    if (!row) throw new Error(`${userId} nao tem personal`);
    return row;
  }

  async function otherProject(userId: string, name: string): Promise<string> {
    const id = ulid();
    await ctx.pool.query("INSERT INTO projects (id, user_id, name) VALUES ($1, $2, $3)", [id, userId, name]);
    return id;
  }

  describe("o personal", () => {
    test("nasce na primeira necessidade, e uma vez so, mesmo com varias gravacoes ao mesmo tempo", async () => {
      expect(await projectsOf(USER)).toEqual([]);

      const resolved = await Promise.all(
        Array.from({ length: 8 }, () => ctx.db.transaction((tx) => ensurePersonalProject(tx, USER))),
      );

      expect(new Set(resolved).size).toBe(1);
      expect(await projectsOf(USER)).toEqual([{ id: resolved[0], user_id: USER, name: "personal", personal: true }]);
    });

    test("duas tarefas criadas ao mesmo tempo por um usuario novo ficam no mesmo personal", async () => {
      const [first, second] = [trackedTask(USER, "Primeira"), trackedTask(USER, "Segunda")];

      await Promise.all([tasks.save(first), tasks.save(second)]);

      const personal = await personalOf(USER);
      expect(await projectsOf(USER)).toHaveLength(1);
      expect((await projectOfTask(first.id)).id).toBe(personal.id);
      expect((await projectOfTask(second.id)).id).toBe(personal.id);
    });

    test("cada usuario tem o seu", async () => {
      await tasks.save(trackedTask(USER, "Minha"));
      await tasks.save(trackedTask(OTHER_USER, "Dele"));

      expect((await personalOf(USER)).id).not.toBe((await personalOf(OTHER_USER)).id);
    });
  });

  describe("toda gravacao que cria tarefa deixa a tarefa com projeto", () => {
    test("criacao pela pessoa", async () => {
      const task = trackedTask(USER, "Ler");
      await tasks.save(task);

      expect(await projectOfTask(task.id)).toMatchObject({ user_id: USER, name: "personal", personal: true });
    });

    test("nascimento de pedido, passos e tarefa de agente", async () => {
      const { requestId } = await store.start({ userId: USER, route: "steps", text: "almocei", job: "request-dispatch" });
      const step = newOrderedId();
      await store.beginSteps(requestId, [{ id: step, agent: "task-create", expected: "many" }]);

      const personal = await personalOf(USER);
      expect((await projectOfTask(requestId)).id).toBe(personal.id);
      expect((await projectOfTask(step)).id).toBe(personal.id);
    });

    test("calculo de alimento", async () => {
      const food = Artifact.create({ userId: USER, type: "food", name: "Feijoada", data: pendingFoodData("feijoada completa") });
      await artifacts.save(food);

      const [request] = await selectRows<{ id: string }>(ctx.pool, "SELECT id FROM tasks WHERE kind = 'build_request'");
      expect(await projectOfTask(request?.id as string)).toMatchObject({ user_id: USER, personal: true });
    });

    test("tarefa criada por voz", async () => {
      const { requestId } = await store.start({ userId: USER, route: "voice", text: "comecei a estudar", job: "voice-task" });
      const task = Task.create({ userId: USER, name: "Estudar", startedAt: new Date("2026-10-25T15:00:00Z") });

      await writer.commit({
        userId: USER, tasks: [{ op: "create", entity: task }], artifacts: [],
        afterWrite: (tx) => store.completeVoice(tx, { requestId, taskId: task.id }),
      });

      expect(await projectOfTask(task.id)).toMatchObject({ user_id: USER, personal: true });
      expect((await projectOfTask(requestId)).id).toBe((await projectOfTask(task.id)).id);
    });

    test("serie e lote do agente de escrita", async () => {
      const series = dailyRecurrence(USER, "2026-11-10");
      const task = trackedTask(USER, "Do lote");
      await writer.commit({ userId: USER, tasks: [{ op: "create", entity: task }], artifacts: [], recurrences: [series] });

      const personal = await personalOf(USER);
      expect((await projectOfTask(task.id)).id).toBe(personal.id);
      const [row] = await selectRows<{ project_id: string }>(ctx.pool, "SELECT project_id FROM recurrences WHERE id = $1", [series.id]);
      expect(row?.project_id).toBe(personal.id);
    });

    test("ocorrencia de serie fica no projeto da serie, e nao no personal", async () => {
      const series = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(series);
      const braid = await otherProject(USER, "braid");
      await ctx.pool.query("UPDATE recurrences SET project_id = $1 WHERE id = $2", [braid, series.id]);

      const occurrence = occurrenceOf(series, "2026-11-10");
      await recurrences.materialize(series, [occurrence]);

      expect((await projectOfTask(occurrence.id)).id).toBe(braid);
      expect((await personalOf(USER)).id).not.toBe(braid);
    });
  });

  describe("GET /api/projects", () => {
    test("o personal de quem ainda nao tem nada nasce na primeira leitura e volta sempre o mesmo", async () => {
      const first = await query.list(USER);
      const again = await query.list(USER);

      expect(first).toEqual([{ id: (await personalOf(USER)).id, name: "personal", personal: true }]);
      expect(again).toEqual(first);
      expect(await projectsOf(USER)).toHaveLength(1);
    });

    test("o personal vem primeiro e os outros por nome, sem misturar os de outro usuario", async () => {
      await tasks.save(trackedTask(USER, "Qualquer"));
      await otherProject(USER, "zeta");
      await otherProject(USER, "Alfa");
      await otherProject(USER, "beta");
      await otherProject(OTHER_USER, "dele");

      expect((await query.list(USER)).map((project) => project.name)).toEqual(["personal", "Alfa", "beta", "zeta"]);
    });
  });

  describe("o cartao e o pedido trazem o projeto", () => {
    test("o cartao da tarefa e a leitura do projeto por tarefa", async () => {
      const task = trackedTask(USER, "Ler");
      await tasks.save(task);
      const braid = await otherProject(USER, "braid");
      const other = trackedTask(USER, "Do braid");
      await tasks.save(other);
      await ctx.pool.query("UPDATE tasks SET project_id = $1 WHERE id = $2", [braid, other.id]);
      const personal = await personalOf(USER);

      const found = await cards.cardsOf([task.id, other.id]);

      expect(found.map((card) => card.project)).toEqual([
        { id: personal.id, name: "personal", personal: true },
        { id: braid, name: "braid", personal: false },
      ]);
      expect(Object.fromEntries(await query.ofTasks([task.id, other.id]))).toEqual({
        [task.id]: { id: personal.id, name: "personal", personal: true },
        [other.id]: { id: braid, name: "braid", personal: false },
      });
    });

    test("o pedido", async () => {
      const { requestId } = await store.start({ userId: USER, route: "steps", text: "almocei", job: "request-dispatch" });

      expect((await store.find(requestId))?.project).toEqual({
        id: (await personalOf(USER)).id,
        name: "personal",
        personal: true,
      });
      expect((await store.list(USER, 10)).map((request) => request.project.personal)).toEqual([true]);
    });
  });
});
