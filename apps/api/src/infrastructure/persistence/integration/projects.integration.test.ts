import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  Artifact,
  ProjectNameTakenError,
  ProjectNotFoundError,
  Task,
  TaskRevisionConflictError,
} from "../../../domain";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../database/postgres-database";
import { PostgresProjectQuery } from "../projects/postgres-project.query";
import { PostgresProjectRepository } from "../projects/postgres-project.repository";
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
  let projects: PostgresProjectRepository;
  let cards: PostgresTaskCardQuery;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    tasks = new PostgresTaskRepository(ctx.db);
    recurrences = new PostgresRecurrenceRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
    writer = new PostgresEntityBatchWriter(ctx.db);
    store = new PostgresRequestStore(new PostgresDatabase(ctx.pool));
    query = new PostgresProjectQuery(ctx.db);
    projects = new PostgresProjectRepository(ctx.db);
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
  describe("criar um projeto", () => {
    test("grava o projeto do usuario, que passa a aparecer na lista depois do personal", async () => {
      const created = await projects.create(USER, "timeline_project");

      expect(created).toEqual({ id: expect.any(String), name: "timeline_project", personal: false });
      expect(await query.list(USER)).toEqual([
        { id: (await personalOf(USER)).id, name: "personal", personal: true },
        created,
      ]);
    });

    test("nome repetido e recusado sem distinguir maiusculas, e o outro usuario pode repetir", async () => {
      await projects.create(USER, "Braid");

      await expect(projects.create(USER, "braid")).rejects.toBeInstanceOf(ProjectNameTakenError);
      await expect(projects.create(USER, "BRAID")).rejects.toBeInstanceOf(ProjectNameTakenError);
      await expect(projects.create(OTHER_USER, "braid")).resolves.toMatchObject({ name: "braid" });
      expect(await projectsOf(USER)).toHaveLength(2);
    });

    test("o personal ja ocupa o nome, mesmo antes de a linha dele existir: ninguem cria um segundo", async () => {
      expect(await projectsOf(USER)).toEqual([]);

      await expect(projects.create(USER, "Personal")).rejects.toBeInstanceOf(ProjectNameTakenError);

      // A recusa desfaz tudo; o personal de verdade nasce na primeira necessidade, sem esbarrar num "Personal" criado antes.
      expect(await projectsOf(USER)).toEqual([]);
      expect(await query.list(USER)).toEqual([{ id: expect.any(String), name: "personal", personal: true }]);
    });

    test("duas criacoes do mesmo nome ao mesmo tempo: uma vale e a outra e recusada", async () => {
      const results = await Promise.allSettled([projects.create(USER, "Mesmo"), projects.create(USER, "mesmo")]);

      expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(
        ProjectNameTakenError,
      );
      expect((await projectsOf(USER)).filter((project) => !project.personal)).toHaveLength(1);
    });

    test("o banco recusa um nome fora do formato mesmo que ninguem tenha normalizado", async () => {
      await expect(projects.create(USER, "")).rejects.toThrow();
      await expect(projects.create(USER, " espaco")).rejects.toThrow();
      await expect(projects.create(USER, "a".repeat(61))).rejects.toThrow();
    });
  });

  describe("a primeira regra da resolucao: o projeto que veio na entrada", () => {
    test("criar a tarefa com projectId a deixa nesse projeto", async () => {
      const braid = await otherProject(USER, "braid");
      const task = trackedTask(USER, "No braid", { projectId: braid });

      await tasks.save(task);

      expect((await projectOfTask(task.id)).id).toBe(braid);
      expect((await cards.cardsOf([task.id]))[0]?.project).toEqual({ id: braid, name: "braid", personal: false });
    });

    test("o projeto de outro usuario e recusado, e nada e gravado", async () => {
      const dele = await otherProject(OTHER_USER, "dele");
      const task = trackedTask(USER, "Roubada", { projectId: dele });

      await expect(tasks.save(task)).rejects.toBeInstanceOf(ProjectNotFoundError);

      expect(await selectRows(ctx.pool, "SELECT id FROM tasks WHERE id = $1", [task.id])).toEqual([]);
    });

    test("um projeto que nao existe e recusado do mesmo jeito", async () => {
      await expect(tasks.save(trackedTask(USER, "Sem projeto", { projectId: ulid() }))).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
    });

    test("a ocorrencia de uma serie com projeto nasce no projeto da serie", async () => {
      const braid = await otherProject(USER, "braid");
      const series = dailyRecurrence(USER, "2026-11-10", { projectId: braid });
      await recurrences.save(series);
      const occurrence = occurrenceOf(series, "2026-11-10");

      await recurrences.materialize(series, [occurrence]);

      const [row] = await selectRows<{ project_id: string }>(ctx.pool, "SELECT project_id FROM recurrences WHERE id = $1", [series.id]);
      expect(row?.project_id).toBe(braid);
      expect((await projectOfTask(occurrence.id)).id).toBe(braid);
    });

    test("uma serie sem projeto no modelo fica em personal, e a de projeto alheio e recusada inteira", async () => {
      const plain = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(plain);
      const dele = await otherProject(OTHER_USER, "dele");
      const stolen = dailyRecurrence(USER, "2026-11-10", { projectId: dele });

      await expect(recurrences.save(stolen)).rejects.toBeInstanceOf(ProjectNotFoundError);

      const [row] = await selectRows<{ project_id: string }>(ctx.pool, "SELECT project_id FROM recurrences WHERE id = $1", [plain.id]);
      expect(row?.project_id).toBe((await personalOf(USER)).id);
      expect(await selectRows(ctx.pool, "SELECT id FROM recurrences WHERE id = $1", [stolen.id])).toEqual([]);
    });
  });

  describe("trocar o projeto de uma tarefa e uma edicao como as outras", () => {
    async function saved(props: Partial<Parameters<typeof trackedTask>[2]> = {}): Promise<Task> {
      const task = trackedTask(USER, "Ler", props);
      await tasks.save(task);
      return (await tasks.findById(task.id)) as Task;
    }

    test("a tarefa lida traz o projeto, e editar com projectId troca o projeto e revisa a tarefa", async () => {
      const braid = await otherProject(USER, "braid");
      const task = await saved();
      expect(task.projectId).toBe((await personalOf(USER)).id);

      await writer.commit({ userId: USER, artifacts: [], tasks: [{ op: "update", entity: task.revise({ projectId: braid }), expectedRevision: 1 }] });

      expect((await projectOfTask(task.id)).id).toBe(braid);
      expect((await tasks.findById(task.id))?.revision).toBe(2);
    });

    test("null devolve a tarefa a personal", async () => {
      const braid = await otherProject(USER, "braid");
      const task = await saved({ projectId: braid });

      await writer.commit({ userId: USER, artifacts: [], tasks: [{ op: "update", entity: task.revise({ projectId: null }), expectedRevision: 1 }] });

      expect(await projectOfTask(task.id)).toMatchObject({ id: (await personalOf(USER)).id, personal: true });
    });

    test("ausente nao muda o projeto", async () => {
      const braid = await otherProject(USER, "braid");
      const task = await saved({ projectId: braid });

      await writer.commit({ userId: USER, artifacts: [], tasks: [{ op: "update", entity: task.revise({ name: "Ler mais" }), expectedRevision: 1 }] });

      expect((await projectOfTask(task.id)).id).toBe(braid);
    });

    test("com a revisao errada da conflito e o projeto fica como estava", async () => {
      const braid = await otherProject(USER, "braid");
      const task = await saved();
      const before = (await projectOfTask(task.id)).id;

      await expect(
        tasks.update(task.revise({ projectId: braid }), USER, 7),
      ).rejects.toBeInstanceOf(TaskRevisionConflictError);

      expect((await projectOfTask(task.id)).id).toBe(before);
    });

    test("o projeto de outro usuario e recusado na edicao e a tarefa nao muda", async () => {
      const dele = await otherProject(OTHER_USER, "dele");
      const task = await saved();

      await expect(
        writer.commit({ userId: USER, artifacts: [], tasks: [{ op: "update", entity: task.revise({ projectId: dele }), expectedRevision: 1 }] }),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);

      expect((await tasks.findById(task.id))?.revision).toBe(1);
    });

    test("editar uma ocorrencia com outro projeto a destaca da serie e ela fica no projeto escolhido", async () => {
      const braid = await otherProject(USER, "braid");
      const series = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(series);
      const occurrence = occurrenceOf(series, "2026-11-10");
      await recurrences.materialize(series, [occurrence]);
      const stored = (await tasks.findById(occurrence.id)) as Task;

      await tasks.update(stored.revise({ projectId: braid }), USER, 1);

      expect((await projectOfTask(occurrence.id)).id).toBe(braid);
      expect((await tasks.findById(occurrence.id))?.occurrence?.detached).toBe(true);
    });

    test("trocar o projeto da serie vale para as ocorrencias seguintes e deixa as passadas onde estavam", async () => {
      const personal = (await query.list(USER))[0] as { id: string };
      const braid = await otherProject(USER, "braid");
      const series = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(series);
      const past = occurrenceOf(series, "2026-11-10");
      await recurrences.materialize(series, [past]);

      const revised = series.revise({ template: { name: "Serie", kind: "common", projectId: braid } });
      await recurrences.update(revised, USER, series.revision, "2026-11-11");
      const next = occurrenceOf(revised, "2026-11-11");
      await recurrences.materialize(revised, [next]);

      expect((await projectOfTask(past.id)).id).toBe(personal.id);
      expect((await projectOfTask(next.id)).id).toBe(braid);
    });

    test("trocar o projeto da serie com a revisao errada da conflito", async () => {
      const braid = await otherProject(USER, "braid");
      const series = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(series);
      const revised = series.revise({ template: { name: "Serie", kind: "common", projectId: braid } });

      await expect(recurrences.update(revised, USER, 9, "2026-11-11")).rejects.toThrow();

      const [row] = await selectRows<{ project_id: string }>(ctx.pool, "SELECT project_id FROM recurrences WHERE id = $1", [series.id]);
      expect(row?.project_id).toBe((await personalOf(USER)).id);
    });
  });
});
