import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  Artifact,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  TaskValidationError,
  type ArtifactLink,
} from "../../../domain";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { PostgresTagRepository } from "../tasks/repositories/postgres-tag.repository";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import {
  GLOBAL_WORKOUT_ID,
  OTHER_USER,
  USER,
  agentTask,
  at,
  countRows,
  dailyRecurrence,
  occurrenceOf,
  pendingFoodData,
  referenceTask,
  selectRows,
  textArtifact,
  trackedTask,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const uses = (artifactId: string, fromRecurrence = false): ArtifactLink => ({ artifactId, relation: "uses", fromRecurrence });

describe("PostgresTaskRepository", () => {
  let ctx: PostgresTestContext;
  let tasks: PostgresTaskRepository;
  let artifacts: PostgresArtifactRepository;
  let recurrences: PostgresRecurrenceRepository;
  let writer: PostgresEntityBatchWriter;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    tasks = new PostgresTaskRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
    recurrences = new PostgresRecurrenceRepository(ctx.db);
    writer = new PostgresEntityBatchWriter(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function saved(task: Task): Promise<Task> {
    await tasks.save(task);
    return task;
  }

  /** A hierarquia so entra pelo lote: cada par e `[principal, subtarefa]`. */
  async function nest(...pairs: Array<[string, string]>): Promise<void> {
    await writer.commit({
      userId: USER,
      tasks: [],
      artifacts: [],
      subtasks: pairs.map(([parentId, subtaskId]) => ({ op: "add" as const, parentId, subtaskId })),
    });
  }

  async function found(taskId: string): Promise<Task> {
    const task = await tasks.findById(taskId);
    if (!task) throw new Error(`Tarefa ${taskId} nao foi encontrada`);
    return task;
  }

  describe("gravar e ler de volta", () => {
    test("tarefa de referencia volta sem status, com o fim estimado e o aviso padrao", async () => {
      const task = referenceTask(USER, "Almoco", "2026-11-10T15:00:00Z", {
        kind: "meal",
        description: "com a equipe",
        priority: "high",
      });
      await tasks.save(task);

      const read = await found(task.id);

      expect(read.isReference).toBe(true);
      expect(read).toMatchObject({
        id: task.id,
        userId: USER,
        actor: "human",
        kind: "meal",
        status: undefined,
        priority: "high",
        name: "Almoco",
        description: "com a equipe",
        longRunning: false,
        revision: 1,
        occurrence: undefined,
      });
      expect(read.startedAt).toEqual(at("2026-11-10T15:00:00Z"));
      // Uma refeicao sem fim declarado estima 20 minutos.
      expect(read.estimatedFinishAt).toEqual(at("2026-11-10T15:20:00Z"));
      expect(read.finishedAt).toBeUndefined();
      expect(read.notifyOffsetsMinutes).toEqual([5]);
    });

    test("tarefa acompanhada volta com status e prazo, sem inicio", async () => {
      const task = trackedTask(USER, "Declarar imposto", {
        status: "doing",
        priority: "urgent",
        estimatedFinishAt: at("2026-11-30T03:00:00Z"),
        notifyOffsetsMinutes: [60, 1440],
      });
      await tasks.save(task);

      const read = await found(task.id);

      expect(read.isReference).toBe(false);
      expect(read.status).toBe("doing");
      expect(read.priority).toBe("urgent");
      expect(read.startedAt).toBeUndefined();
      expect(read.estimatedFinishAt).toEqual(at("2026-11-30T03:00:00Z"));
      expect(read.notifyOffsetsMinutes).toEqual([60, 1440]);
    });

    test("tarefa longa aceita um bloco maior que 31 dias e nasce todo", async () => {
      const task = Task.create({
        userId: USER,
        name: "Reforma da casa",
        longRunning: true,
        startedAt: at("2026-11-01T12:00:00Z"),
        estimatedFinishAt: at("2027-03-01T12:00:00Z"),
      });
      await tasks.save(task);

      const read = await found(task.id);

      expect(read.longRunning).toBe(true);
      expect(read.status).toBe("todo");
      expect(read.startedAt).toEqual(at("2026-11-01T12:00:00Z"));
      expect(read.estimatedFinishAt).toEqual(at("2027-03-01T12:00:00Z"));
    });

    test("tarefa de agente volta com o executor, o status de agente e a data", async () => {
      const task = agentTask(USER, "Montar o cardapio da semana", {
        kind: "build_request",
        status: "waiting",
        data: { route: "steps", screen: { path: "/agenda" } },
        finishedAt: at("2026-11-10T12:05:00Z"),
      });
      await tasks.save(task);

      const read = await found(task.id);

      expect(read).toMatchObject({ actor: "agent", kind: "build_request", status: "waiting" });
      expect(read.data).toEqual({ route: "steps", screen: { path: "/agenda" } });
      expect(read.finishedAt).toEqual(at("2026-11-10T12:05:00Z"));
      // Tarefa de agente nao ganha fim estimado nem aviso.
      expect(read.estimatedFinishAt).toBeUndefined();
      expect(read.notifyOffsetsMinutes).toEqual([]);
    });

    test("findByIds deixa de fora os ids ausentes e as tarefas apagadas", async () => {
      const kept = await saved(trackedTask(USER, "Fica"));
      const removed = await saved(trackedTask(USER, "Sai"));
      await tasks.delete(removed.id, USER);

      const read = await tasks.findByIds([kept.id, removed.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]);

      expect(read.map((task) => task.id)).toEqual([kept.id]);
      expect(await tasks.findByIds([])).toEqual([]);
    });
  });

  describe("tags", () => {
    test("normaliza, grava uma tag por usuario e nome e devolve em ordem alfabetica", async () => {
      const first = await saved(trackedTask(USER, "Correr", { tags: [" Saude ", "casa", "SAUDE"] }));
      const second = await saved(trackedTask(USER, "Nadar", { tags: ["saude"] }));
      await saved(trackedTask(OTHER_USER, "Do outro", { tags: ["saude"] }));

      expect((await found(first.id)).tags).toEqual(["casa", "saude"]);
      expect((await found(second.id)).tags).toEqual(["saude"]);
      // A mesma tag dos duas tarefas e uma linha so; a do outro usuario e outra.
      expect(await countRows(ctx.pool, "tags", "user_id = $1", [USER])).toBe(2);
      expect(await countRows(ctx.pool, "tags", "name = 'saude'")).toBe(2);
    });

    test("editar troca as tags da tarefa sem apagar a tag de outros", async () => {
      const task = await saved(trackedTask(USER, "Correr", { tags: ["saude", "casa"] }));
      const other = await saved(trackedTask(USER, "Nadar", { tags: ["saude"] }));

      await tasks.update(task.revise({ tags: ["trabalho"] }), USER, 1);

      expect((await found(task.id)).tags).toEqual(["trabalho"]);
      expect((await found(other.id)).tags).toEqual(["saude"]);
    });

    test("sugere por prefixo so as tags do usuario, sem tratar % como curinga", async () => {
      await saved(trackedTask(USER, "A", { tags: ["saude", "sabado", "casa", "100%"] }));
      await saved(trackedTask(OTHER_USER, "B", { tags: ["samba"] }));
      const tags = new PostgresTagRepository(ctx.db);

      const suggestions = await tags.suggest({ userId: USER, query: " SA", limit: 10 });

      expect(suggestions.map((tag) => tag.name)).toEqual(["sabado", "saude"]);
      expect((await tags.suggest({ userId: USER, query: "s", limit: 1 })).map((tag) => tag.name)).toEqual(["sabado"]);
      expect((await tags.suggest({ userId: USER, query: "%", limit: 10 })).map((tag) => tag.name)).toEqual([]);
      expect((await tags.suggest({ userId: USER, query: "100%", limit: 10 })).map((tag) => tag.name)).toEqual(["100%"]);
    });
  });

  describe("relacoes com artefatos", () => {
    test("os artefatos voltam na ordem, com a relacao e a marca de serie", async () => {
      const [a, b, c] = [textArtifact(USER, "a"), textArtifact(USER, "b"), textArtifact(USER, "c")];
      for (const artifact of [a, b, c]) await artifacts.save(artifact);
      const links: ArtifactLink[] = [
        { artifactId: b.id, relation: "uses", fromRecurrence: false },
        { artifactId: a.id, relation: "creates", fromRecurrence: true },
        { artifactId: c.id, relation: "updates", fromRecurrence: false },
      ];
      const task = await saved(trackedTask(USER, "Revisar notas", { artifactLinks: links }));

      expect((await found(task.id)).artifactLinks).toEqual(links);
      const rows = await selectRows(
        ctx.pool,
        "SELECT artifact_id, position FROM task_artifact_relation WHERE task_id = $1 ORDER BY position",
        [task.id],
      );
      expect(rows).toEqual([
        { artifact_id: b.id, position: 0 },
        { artifact_id: a.id, position: 1 },
        { artifact_id: c.id, position: 2 },
      ]);
    });

    test("reordenar, tirar e acrescentar artefatos numa edicao so", async () => {
      const [a, b, c, d] = ["a", "b", "c", "d"].map((body) => textArtifact(USER, body));
      for (const artifact of [a, b, c, d]) await artifacts.save(artifact);
      const task = await saved(trackedTask(USER, "Revisar notas", { artifactLinks: [uses(a.id), uses(b.id), uses(c.id)] }));

      // c e a trocam de lugar, b sai e d entra: as posicoes 0 e 1 mudam de dono na mesma transacao.
      await tasks.update(task.revise({ artifactLinks: [uses(c.id), uses(a.id), uses(d.id)] }), USER, 1);

      expect((await found(task.id)).artifactLinks.map((link) => link.artifactId)).toEqual([c.id, a.id, d.id]);
      expect(await countRows(ctx.pool, "task_artifact_relation", "task_id = $1", [task.id])).toBe(3);
    });

    test("um artefato global pode ser ligado à tarefa", async () => {
      const task = await saved(
        referenceTask(USER, "Corrida no parque", "2026-11-10T10:00:00Z", {
          kind: "training",
          artifactLinks: [uses(GLOBAL_WORKOUT_ID)],
        }),
      );

      expect((await found(task.id)).artifactLinks).toEqual([uses(GLOBAL_WORKOUT_ID)]);
    });

    test("o artefato que nasce com a tarefa e gravada na mesma transacao", async () => {
      const note = textArtifact(USER, "ata da reuniao");
      const task = referenceTask(USER, "Reuniao", "2026-11-10T13:00:00Z", {
        artifactLinks: [{ artifactId: note.id, relation: "creates", fromRecurrence: false }],
      });

      await tasks.save(task, { created: [note] });

      expect((await found(task.id)).artifactLinks.map((link) => link.artifactId)).toEqual([note.id]);
      expect(await artifacts.findById(note.id)).not.toBeNull();
    });

    test("se a tarefa e recusada, o artefato que nasceria com ela tambem nao entra", async () => {
      const food = Artifact.create({ userId: USER, type: "food", name: "Feijoada", data: pendingFoodData("feijoada") });
      const task = referenceTask(USER, "Almoco", "2026-11-10T15:00:00Z", {
        artifactLinks: [uses(food.id), uses("01ARZ3NDEKTSV4RRFFQ69G5FAV")],
      });

      await expect(tasks.save(task, { created: [food] })).rejects.toThrow(TaskValidationError);

      expect(await tasks.findById(task.id)).toBeNull();
      expect(await artifacts.findById(food.id)).toBeNull();
      // Nem o pedido de construcao do alimento, nem o job dele.
      expect(await countRows(ctx.pool, "tasks")).toBe(0);
      expect(await countRows(ctx.pool, "jobs")).toBe(0);
    });

    test("o artefato apagado some da lista da tarefa, e a relacao fica", async () => {
      const [kept, removed] = [textArtifact(USER, "fica"), textArtifact(USER, "sai")];
      for (const artifact of [kept, removed]) await artifacts.save(artifact);
      const task = await saved(trackedTask(USER, "Tarefa", { artifactLinks: [uses(removed.id), uses(kept.id)] }));

      await artifacts.delete(removed.id, USER);

      expect((await found(task.id)).artifactLinks.map((link) => link.artifactId)).toEqual([kept.id]);
      expect(await countRows(ctx.pool, "task_artifact_relation", "task_id = $1", [task.id])).toBe(2);
    });
  });

  describe("hierarquia entre tarefas", () => {
    test("a principal volta em parentId e as subtarefas em subtaskIds, e nenhuma e revisada", async () => {
      const first = await saved(trackedTask(USER, "Reformar a casa"));
      const second = await saved(trackedTask(USER, "Pintar a sala"));
      const third = await saved(trackedTask(USER, "Comprar tinta"));
      await nest([first.id, second.id], [second.id, third.id]);

      expect(await found(first.id)).toMatchObject({ parentId: undefined, subtaskIds: [second.id], revision: 1 });
      expect(await found(second.id)).toMatchObject({ parentId: first.id, subtaskIds: [third.id], revision: 1 });
      expect(await found(third.id)).toMatchObject({ parentId: second.id, subtaskIds: [], revision: 1 });
      expect(await selectRows(ctx.pool, "SELECT relation FROM task_task_relation")).toEqual([
        { relation: "subtask" },
        { relation: "subtask" },
      ]);
    });

    test("uma tarefa tem uma so principal e varias subtarefas", async () => {
      const one = await saved(trackedTask(USER, "Reforma"));
      const two = await saved(trackedTask(USER, "Compras do mes"));
      const shared = await saved(trackedTask(USER, "Comprar tinta"));
      const after = await saved(trackedTask(USER, "Pintar"));
      const other = await saved(trackedTask(USER, "Limpar"));
      await nest([one.id, shared.id], [shared.id, after.id], [shared.id, other.id]);
      await nest([two.id, shared.id]);

      const read = await found(shared.id);
      expect(read.parentId).toBe(two.id);
      expect([...read.subtaskIds].sort()).toEqual([after.id, other.id].sort());
      expect((await found(one.id)).subtaskIds).toEqual([]);
    });

    test("uma ponta pode ser tarefa de agente, nos dois sentidos", async () => {
      const request = await saved(agentTask(USER, "Montar o cardapio", { kind: "build_request" }));
      const person = await saved(trackedTask(USER, "Fazer as compras"));
      const reply = await saved(agentTask(USER, "Conferir a despensa", { kind: "build_request" }));
      await nest([request.id, person.id], [person.id, reply.id]);

      expect(await found(request.id)).toMatchObject({ actor: "agent", subtaskIds: [person.id], revision: 1 });
      expect(await found(person.id)).toMatchObject({ parentId: request.id, subtaskIds: [reply.id] });
      expect((await found(reply.id)).parentId).toBe(person.id);
    });

    test("gravar ou editar uma tarefa nao escreve nem apaga arestas da hierarquia", async () => {
      const first = await saved(trackedTask(USER, "Primeiro"));
      const second = await saved(trackedTask(USER, "Segundo"));
      await nest([first.id, second.id]);

      await tasks.update(second.revise({ name: "Segundo, editado", tags: ["casa"] }), USER, 1);
      await tasks.update(first.revise({ name: "Primeiro, editado" }), USER, 1);

      expect(await found(first.id)).toMatchObject({ name: "Primeiro, editado", subtaskIds: [second.id], revision: 2 });
      expect(await found(second.id)).toMatchObject({ name: "Segundo, editado", parentId: first.id, revision: 2 });
      expect(await countRows(ctx.pool, "task_task_relation", "relation = 'subtask'")).toBe(1);
    });

    test("a tarefa apagada some das listas de quem aponta para ela e de quem ela aponta", async () => {
      const before = await saved(trackedTask(USER, "Antes"));
      const middle = await saved(trackedTask(USER, "Meio"));
      const after = await saved(trackedTask(USER, "Depois"));
      const sibling = await saved(trackedTask(USER, "Irmao"));
      await nest([before.id, middle.id], [middle.id, after.id], [before.id, sibling.id]);

      await tasks.delete(middle.id, USER);
      expect((await found(before.id)).subtaskIds).toEqual([sibling.id]);
      expect((await found(after.id)).parentId).toBeUndefined();

      await tasks.delete(before.id, USER);
      expect((await found(sibling.id)).parentId).toBeUndefined();
    });

    test("findByIds traz parentId e subtaskIds de varias tarefas de uma vez", async () => {
      const first = await saved(trackedTask(USER, "Primeiro"));
      const second = await saved(trackedTask(USER, "Segundo"));
      await nest([first.id, second.id]);

      const read = await tasks.findByIds([first.id, second.id]);

      expect(read.find((task) => task.id === first.id)?.subtaskIds).toEqual([second.id]);
      expect(read.find((task) => task.id === second.id)?.parentId).toBe(first.id);
    });
  });

  describe("dono das pontas", () => {
    test("recusa relacao com artefato de outro usuario ou apagado, tambem na edicao", async () => {
      const foreign = textArtifact(OTHER_USER, "do outro");
      const removed = textArtifact(USER, "apagado");
      for (const artifact of [foreign, removed]) await artifacts.save(artifact);
      await artifacts.delete(removed.id, USER);

      for (const artifactId of [foreign.id, removed.id]) {
        await expect(tasks.save(trackedTask(USER, "Novo", { artifactLinks: [uses(artifactId)] }))).rejects.toThrow(
          /Related artifacts not found/,
        );
      }

      const task = await saved(trackedTask(USER, "Existente"));
      await expect(tasks.update(task.revise({ artifactLinks: [uses(foreign.id)] }), USER, 1)).rejects.toThrow(
        /Related artifacts not found/,
      );
      expect((await found(task.id)).revision).toBe(1);
    });
  });

  describe("editar", () => {
    test("grava os campos novos e incrementa a revisao", async () => {
      const task = await saved(referenceTask(USER, "Almoco", "2026-11-10T15:00:00Z", { kind: "meal" }));

      const revised = task.revise({
        name: "Almoco com a equipe",
        status: "done",
        priority: "low",
        startedAt: at("2026-11-10T16:00:00Z"),
        estimatedFinishAt: at("2026-11-10T17:00:00Z"),
        finishedAt: at("2026-11-10T17:10:00Z"),
        notifyOffsetsMinutes: [10, 30],
      });
      await tasks.update(revised, USER, 1);

      const read = await found(task.id);
      expect(read).toMatchObject({ name: "Almoco com a equipe", status: "done", priority: "low", revision: 2 });
      expect(read.startedAt).toEqual(at("2026-11-10T16:00:00Z"));
      expect(read.estimatedFinishAt).toEqual(at("2026-11-10T17:00:00Z"));
      expect(read.finishedAt).toEqual(at("2026-11-10T17:10:00Z"));
      expect(read.notifyOffsetsMinutes).toEqual([10, 30]);
    });

    test("tirar o status devolve a tarefa a referencia", async () => {
      const task = await saved(
        Task.create({ userId: USER, name: "Consulta", status: "todo", startedAt: at("2026-11-10T15:00:00Z") }),
      );

      await tasks.update(task.revise({ status: null, finishedAt: null }), USER, 1);

      expect((await found(task.id)).isReference).toBe(true);
    });

    test("revisao desatualizada e conflito", async () => {
      const task = await saved(trackedTask(USER, "Tarefa"));
      await tasks.update(task.revise({ name: "Primeira edicao" }), USER, 1);

      await expect(tasks.update(task.revise({ name: "Edicao atrasada" }), USER, 1)).rejects.toThrow(
        TaskRevisionConflictError,
      );
      expect((await found(task.id)).name).toBe("Primeira edicao");
    });

    test("outro usuario nao edita", async () => {
      const task = await saved(trackedTask(USER, "Tarefa"));

      await expect(tasks.update(task.revise({ name: "Invadido" }), OTHER_USER, 1)).rejects.toThrow(TaskOwnershipError);
      expect((await found(task.id)).name).toBe("Tarefa");
    });

    test("tarefa apagada conta como inexistente", async () => {
      const task = await saved(trackedTask(USER, "Tarefa"));
      await tasks.delete(task.id, USER);

      await expect(tasks.update(task.revise({ name: "Tarde demais" }), USER, 1)).rejects.toThrow(TaskNotFoundError);
    });

    test("tarefa de agente nao e editada nem apagada pelo repositorio", async () => {
      const request = await saved(agentTask(USER, "Pedido"));
      // O dominio ja recusa `revise` numa tarefa de agente; aqui a linha e montada a mao para chegar ao repositorio.
      const forged = Task.rehydrate({
        id: request.id,
        userId: USER,
        actor: "agent",
        kind: "request",
        status: "completed",
        name: "Forjado",
        startedAt: request.startedAt,
        revision: 2,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      });

      await expect(tasks.update(forged, USER, 1)).rejects.toThrow(TaskNotFoundError);
      await expect(tasks.delete(request.id, USER)).rejects.toThrow(TaskNotFoundError);

      const read = await found(request.id);
      expect(read).toMatchObject({ name: "Pedido", status: "running", revision: 1 });
    });
  });

  describe("apagar", () => {
    test("a tarefa apagada some das leituras e a linha fica", async () => {
      const task = await saved(trackedTask(USER, "Tarefa", { tags: ["casa"] }));

      await tasks.delete(task.id, USER);

      expect(await tasks.findById(task.id)).toBeNull();
      const [row] = await selectRows(ctx.pool, "SELECT deleted_at FROM tasks WHERE id = $1", [task.id]);
      expect(row.deleted_at).toBeInstanceOf(Date);
      await expect(tasks.delete(task.id, USER)).rejects.toThrow(TaskNotFoundError);
    });

    test("outro usuario nao apaga", async () => {
      const task = await saved(trackedTask(USER, "Tarefa"));

      await expect(tasks.delete(task.id, OTHER_USER)).rejects.toThrow(TaskOwnershipError);
      expect(await tasks.findById(task.id)).not.toBeNull();
    });

    test("apagar uma ocorrencia registra a excecao do dia na serie", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(recurrence);
      const occurrence = await saved(occurrenceOf(recurrence, "2026-11-12"));
      const loose = await saved(trackedTask(USER, "Fora de serie"));

      await tasks.delete(occurrence.id, USER);
      await tasks.delete(loose.id, USER);

      expect(await tasks.findById(occurrence.id)).toBeNull();
      expect(await recurrences.listExceptions(recurrence.id)).toEqual(["2026-11-12"]);
    });

    test("editar uma ocorrencia destaca-a da serie", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(recurrence);
      const occurrence = await saved(occurrenceOf(recurrence, "2026-11-12"));
      expect((await found(occurrence.id)).occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: "2026-11-12",
        detached: false,
      });

      await tasks.update(occurrence.revise({ name: "So hoje" }), USER, 1);

      expect((await found(occurrence.id)).occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: "2026-11-12",
        detached: true,
      });
    });
  });
});
