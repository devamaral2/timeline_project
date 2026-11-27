import { describe, expect, test } from "vitest";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactValidationError,
  EntityBatchConflictError,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskValidationError,
} from "../../domain/index";
import { parseInstant, toEntityBatch } from "./create-task.usecase";
import { createTasksKit, type TasksKitOptions } from "./testing/in-memory-tasks-kit";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo: hora de almoco.
const now = new Date("2026-08-17T15:00:00.000Z");
const MINUTE = 60_000;

const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};
const foodData = { description: "arroz branco", items: [], totals: { ...zeroTotals, totalCaloriesKcal: 130 } };

function setup(options: TasksKitOptions = {}) {
  return createTasksKit({ clock: () => now, ...options });
}

function humanTask(id: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId: actor.userId, name: id, status: "todo", ...overrides });
}

describe("reference and tracked defaults", () => {
  test("a reference task without a start begins now, with the default duration and notification", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Reunião", tags: ["Trabalho"] }, actor);

    const saved = await kit.taskRepository.findById(taskId);
    expect(taskId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(saved).toMatchObject({
      userId: "auth-user-1",
      actor: "human",
      kind: "common",
      name: "Reunião",
      description: "",
      priority: "medium",
      tags: ["trabalho"],
      notifyOffsetsMinutes: [5],
      longRunning: false,
      revision: 1,
    });
    expect(saved?.status).toBeUndefined();
    expect(saved?.startedAt).toEqual(now);
    expect(saved?.estimatedFinishAt).toEqual(new Date(now.getTime() + 60 * MINUTE));
    expect(saved?.finishedAt).toBeUndefined();
  });

  test("keeps the window, the conclusion and the fields that were given", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute(
      {
        name: "Consulta",
        description: "Dentista",
        priority: "high",
        startedAt: "2026-08-20T13:00:00.000Z",
        estimatedFinishAt: "2026-08-20T13:40:00.000Z",
        finishedAt: "2026-08-20T13:35:00.000Z",
        notifyOffsetsMinutes: [60, 1440],
      },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved).toMatchObject({ description: "Dentista", priority: "high", notifyOffsetsMinutes: [60, 1440] });
    expect(saved?.startedAt?.toISOString()).toBe("2026-08-20T13:00:00.000Z");
    expect(saved?.estimatedFinishAt?.toISOString()).toBe("2026-08-20T13:40:00.000Z");
    expect(saved?.finishedAt?.toISOString()).toBe("2026-08-20T13:35:00.000Z");
  });

  test("a tracked task may have no dates and gets no default notification", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Declarar imposto", status: "toDefine" }, actor);

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved?.status).toBe("toDefine");
    expect(saved?.startedAt).toBeUndefined();
    expect(saved?.estimatedFinishAt).toBeUndefined();
    expect(saved?.notifyOffsetsMinutes).toEqual([]);
  });

  test("a tracked task keeps its start but gets no estimated finish", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute(
      { name: "Pagar aluguel", status: "todo", startedAt: "2026-09-05T12:00:00.000Z" },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved?.startedAt?.toISOString()).toBe("2026-09-05T12:00:00.000Z");
    expect(saved?.estimatedFinishAt).toBeUndefined();
  });

  test("a long-running task is born todo, without a start", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Reforma", longRunning: true }, actor);

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved).toMatchObject({ longRunning: true, status: "todo", notifyOffsetsMinutes: [] });
    expect(saved?.startedAt).toBeUndefined();
  });

  test("the schedule resolved by the caller overrides the dates of the input", async () => {
    const kit = setup();
    const schedule = {
      startedAt: new Date("2026-08-18T10:00:00.000Z"),
      estimatedFinishAt: new Date("2026-08-18T10:30:00.000Z"),
    };

    const { taskId } = await kit.createTask.execute(
      { name: "Correr", startedAt: "2026-01-01T00:00:00.000Z", estimatedFinishAt: "2026-01-01T01:00:00.000Z" },
      actor,
      schedule,
    );

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved?.startedAt).toEqual(schedule.startedAt);
    expect(saved?.estimatedFinishAt).toEqual(schedule.estimatedFinishAt);
  });

  test("a schedule without a finish falls back to the finish of the input, then to the default duration", async () => {
    const kit = setup();
    const schedule = { startedAt: new Date("2026-08-18T10:00:00.000Z") };

    const { task } = await kit.createTask.prepare({ name: "Correr" }, actor, schedule);

    expect(task.estimatedFinishAt).toEqual(new Date("2026-08-18T11:00:00.000Z"));
  });

  test("rejects an invalid date, an unknown kind and an unknown status", async () => {
    const kit = setup();

    await expect(kit.createTask.execute({ name: "x", startedAt: "amanha" }, actor)).rejects.toThrow("Invalid date");
    await expect(kit.createTask.execute({ name: "x", kind: "request" as never }, actor)).rejects.toThrow(
      "Unknown task kind: request",
    );
    await expect(kit.createTask.execute({ name: "x", status: "queued" as never }, actor)).rejects.toThrow(
      "Unknown task status: queued",
    );
    expect(kit.database.tasks).toEqual([]);
  });

  test("parseInstant translates what came and refuses what is not a date", () => {
    expect(parseInstant(undefined)).toBeUndefined();
    expect(parseInstant("2026-08-17T15:00:00.000Z")).toEqual(now);
    expect(() => parseInstant("ontem")).toThrow(TaskValidationError);
  });
});

describe("kind and name", () => {
  test("a routine requires a name", async () => {
    const kit = setup();

    await expect(kit.createTask.execute({}, actor)).rejects.toThrow("Task requires a name");
    await expect(kit.createTask.execute({ artifacts: [{ data: { body: "nota" } }] }, actor)).rejects.toThrow(
      "Task requires a name",
    );
  });

  test("infers the kind from the first food, sleep or training artifact", async () => {
    const kit = setup();
    const kindOf = async (artifacts: Parameters<typeof kit.createTask.prepare>[0]["artifacts"]) =>
      (await kit.createTask.prepare({ name: "x", artifacts }, actor)).task.kind;

    expect(await kindOf([{ type: "sleep" }])).toBe("sleep");
    expect(await kindOf([{ type: "training" }])).toBe("training");
    expect(await kindOf([{ type: "food", data: { inputText: "banana" } }])).toBe("meal");
    expect(await kindOf([{ data: { body: "nota" } }])).toBe("common");
    expect(await kindOf([{ data: { body: "nota" } }, { type: "training" }, { type: "sleep" }])).toBe("training");
    expect(await kindOf([])).toBe("common");
  });

  test("the kind that was given wins over the artifacts", async () => {
    const kit = setup();

    const { task, artifacts } = await kit.createTask.prepare(
      { name: "Churrasco", kind: "common", artifacts: [{ type: "food", data: { inputText: "picanha" } }] },
      actor,
    );

    expect(task.kind).toBe("common");
    expect(artifacts.map((artifact) => artifact.type)).toEqual(["food"]);
  });

  test("sleep and training get the name of their kind, and the duration of it", async () => {
    const kit = setup();

    const sleep = await kit.createTask.prepare({ artifacts: [{ type: "sleep", data: { trackedSleepTime: 420 } }] }, actor);
    const training = await kit.createTask.prepare({ kind: "training" }, actor);

    expect(sleep.task.name).toBe("Sono");
    expect(sleep.task.estimatedFinishAt).toEqual(new Date(now.getTime() + 7 * 60 * MINUTE));
    expect(sleep.artifacts[0]?.data).toEqual({ trackedSleepTime: 420, score: 0 });
    expect(training.task.name).toBe("Treino");
    expect(training.task.estimatedFinishAt).toEqual(new Date(now.getTime() + 90 * MINUTE));
    expect(training.artifacts).toEqual([]);
  });

  test("a training artifact resolves the workout names from the global exercises", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute(
      {
        tags: ["Gym"],
        artifacts: [
          { type: "training", data: { workouts: [{ workoutCode: "running", pace: 320, distance: 5, duration: 25, calories: 320 }] } },
        ],
      },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved).toMatchObject({ kind: "training", name: "Treino", tags: ["gym"] });
    expect(saved?.artifactLinks).toEqual([
      { artifactId: kit.database.artifacts[0]?.id, relation: "creates", fromRecurrence: false },
    ]);
    expect(kit.database.artifacts[0]?.data).toMatchObject({
      workouts: [{ workoutCode: "running", workoutName: "Corrida", calories: 320 }],
      caloriesBurned: 320,
    });
  });

  test("a meal is named after the time of day of its start", async () => {
    const kit = setup();

    const lunch = await kit.createTask.prepare({ kind: "meal" }, actor);
    const dinner = await kit.createTask.prepare({ kind: "meal", startedAt: "2026-08-17T23:00:00.000Z" }, actor);

    expect(lunch.task.name).toBe("Almoço");
    expect(dinner.task.name).toBe("Jantar");
  });

  test("a meal takes the name of its food when the food has one", async () => {
    const kit = setup();

    const { task } = await kit.createTask.prepare(
      { artifacts: [{ type: "food", name: "Feijoada", data: { inputText: "feijoada completa" } }] },
      actor,
    );

    expect(task.kind).toBe("meal");
    expect(task.name).toBe("Feijoada");
  });

  test("the name that was given is kept", async () => {
    const kit = setup();

    expect((await kit.createTask.prepare({ kind: "meal", name: "Aniversário" }, actor)).task.name).toBe("Aniversário");
  });
});

describe("meal tasks and their food", () => {
  test("a meal task without a food creates a pending one from what the task says", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ kind: "meal", description: "  arroz, feijão e bife  " }, actor);

    const saved = await kit.taskRepository.findById(taskId);
    const [food] = kit.database.artifacts;
    expect(kit.database.artifacts).toHaveLength(1);
    expect(food).toMatchObject({ type: "food", userId: "auth-user-1", name: "Almoço", derived: false, revision: 1 });
    expect(food?.data).toEqual({
      description: "arroz, feijão e bife",
      items: [],
      totals: zeroTotals,
      generation: { status: "pending" },
    });
    expect(saved?.artifactLinks).toEqual([{ artifactId: food?.id, relation: "creates", fromRecurrence: false }]);
    expect(saved?.name).toBe("Almoço");
    expect(saved?.estimatedFinishAt).toEqual(new Date(now.getTime() + 20 * MINUTE));
  });

  test("the pending food describes the name of the task, or the meal of that hour, when there is no description", async () => {
    const kit = setup();

    const named = await kit.createTask.prepare({ kind: "meal", name: "Pizza com amigos" }, actor);
    const bare = await kit.createTask.prepare({ kind: "meal" }, actor);

    expect(named.artifacts[0]?.data).toMatchObject({ description: "Pizza com amigos" });
    expect(bare.artifacts[0]?.data).toMatchObject({ description: "Almoço" });
  });

  test("`derivedArtifacts: false` creates no food for the meal", async () => {
    const kit = setup();

    const { task, artifacts } = await kit.createTask.prepare({ kind: "meal" }, actor, undefined, {
      derivedArtifacts: false,
    });

    expect(task.kind).toBe("meal");
    expect(task.name).toBe("Almoço");
    expect(artifacts).toEqual([]);
    expect(task.artifactLinks).toEqual([]);
  });

  test("a food that comes with the meal is the only one, pending with its own text", async () => {
    const kit = setup();

    const { task, artifacts } = await kit.createTask.prepare(
      { kind: "meal", description: "almoço de domingo", artifacts: [{ type: "food", data: { inputText: " lasanha " } }] },
      actor,
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.data).toMatchObject({ description: "lasanha", generation: { status: "pending" } });
    expect(task.artifactLinks).toHaveLength(1);
  });

  test("a food without text falls back to what the task says", async () => {
    const kit = setup();

    const { artifacts } = await kit.createTask.prepare(
      { description: "sopa de legumes", artifacts: [{ type: "food", data: { inputText: "   " } }] },
      actor,
    );

    expect(artifacts[0]?.data).toMatchObject({ description: "sopa de legumes" });
  });

  test("a meal that uses a food that already exists creates no other", async () => {
    const existing = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ artifacts: [existing] });

    const { task, artifacts } = await kit.createTask.prepare({ kind: "meal", artifactIds: [existing.id] }, actor);

    expect(artifacts).toEqual([]);
    expect(task.artifactLinks).toEqual([{ artifactId: existing.id, relation: "uses", fromRecurrence: false }]);
  });

  test("a non-meal task never gets a food on its own", async () => {
    const kit = setup();

    expect((await kit.createTask.prepare({ name: "Reunião" }, actor)).artifacts).toEqual([]);
  });
});

describe("copy of a food (`copyOf`)", () => {
  test("creates a derived copy with the quantity, records the derivation and never touches the original", async () => {
    const original = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ artifacts: [original] });

    const { taskId } = await kit.createTask.execute(
      { artifacts: [{ copyOf: original.id, quantity: "2 colheres" }] },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    const copy = kit.database.artifacts.find((artifact) => artifact.id !== original.id);
    expect(kit.database.artifacts).toHaveLength(2);
    expect(copy).toMatchObject({ type: "food", name: "Arroz", derived: true, userId: "auth-user-1", revision: 1 });
    expect(copy?.data).toEqual({ ...foodData, quantity: "2 colheres" });
    expect(kit.database.derivations).toEqual([{ originalId: original.id, copyId: copy?.id }]);
    expect(saved?.artifactLinks).toEqual([{ artifactId: copy?.id, relation: "uses", fromRecurrence: false }]);
    // A tarefa vira refeicao pela copia, e nao ganha um alimento pendente a mais.
    expect(saved).toMatchObject({ kind: "meal", name: "Arroz" });
    // O original e o mesmo objeto, na mesma revisao, e nao aparece na tarefa.
    expect(kit.database.artifacts[0]).toBe(original);
    expect(original.revision).toBe(1);
    expect(original.derived).toBe(false);
    expect(original.data).toEqual(foodData);
    expect(kit.batchWriter.commits[0]?.artifacts).toEqual([{ op: "create", entity: copy }]);
  });

  test("copies a global food into a copy owned by the user", async () => {
    const global = Artifact.create({ type: "food", name: "Banana", data: foodData });
    const kit = setup({ artifacts: [global] });

    const { artifacts, derivations } = await kit.createTask.prepare({ artifacts: [{ copyOf: global.id }] }, actor);

    expect(artifacts[0]).toMatchObject({ userId: "auth-user-1", derived: true });
    expect(artifacts[0]?.data).not.toHaveProperty("quantity");
    expect(derivations).toEqual([{ originalId: global.id, copyId: artifacts[0]?.id }]);
  });

  test("refuses a food that does not exist, someone else's food and an artifact that is not a food", async () => {
    const theirs = Artifact.create({ userId: "someone-else", type: "food", name: "Arroz", data: foodData });
    const note = Artifact.create({ userId: actor.userId, data: { body: "nota" } });
    const kit = setup({ artifacts: [theirs, note] });

    await expect(kit.createTask.execute({ artifacts: [{ copyOf: "missing" }] }, actor)).rejects.toThrow(
      ArtifactNotFoundError,
    );
    await expect(kit.createTask.execute({ artifacts: [{ copyOf: theirs.id }] }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    await expect(kit.createTask.execute({ name: "x", artifacts: [{ copyOf: note.id }] }, actor)).rejects.toThrow(
      ArtifactValidationError,
    );
    expect(kit.database.tasks).toEqual([]);
    expect(kit.database.artifacts).toHaveLength(2);
    expect(kit.database.derivations).toEqual([]);
  });
});

describe("artifacts that already exist (`artifactIds`)", () => {
  test("appear in the task after the new ones, as used, without being changed", async () => {
    const own = Artifact.create({ userId: actor.userId, data: { body: "pauta" } });
    const global = Artifact.create({ type: "workout", name: "Corrida", data: { code: "running", category: "cardio" } });
    const kit = setup({ artifacts: [own, global] });

    const { taskId } = await kit.createTask.execute(
      { name: "Reunião", artifacts: [{ data: { body: "ata" } }], artifactIds: [own.id, global.id] },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    const created = kit.database.artifacts.find((artifact) => artifact.id !== own.id && artifact.id !== global.id);
    expect(saved?.artifactLinks).toEqual([
      { artifactId: created?.id, relation: "creates", fromRecurrence: false },
      { artifactId: own.id, relation: "uses", fromRecurrence: false },
      { artifactId: global.id, relation: "uses", fromRecurrence: false },
    ]);
    expect(kit.database.artifacts).toHaveLength(3);
    expect(own.revision).toBe(1);
    expect(kit.batchWriter.commits[0]?.artifacts).toEqual([{ op: "create", entity: created }]);
  });

  test("must be owned by the user or global, and must exist", async () => {
    const theirs = Artifact.create({ userId: "someone-else", data: { body: "dele" } });
    const kit = setup({ artifacts: [theirs] });

    await expect(kit.createTask.execute({ name: "x", artifactIds: [theirs.id] }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    await expect(kit.createTask.execute({ name: "x", artifactIds: ["missing"] }, actor)).rejects.toThrow(
      "Artifact not found: missing",
    );
    expect(kit.database.tasks).toEqual([]);
  });

  test("the same artifact cannot appear twice in the task", async () => {
    const own = Artifact.create({ userId: actor.userId, data: { body: "pauta" } });
    const kit = setup({ artifacts: [own] });

    await expect(kit.createTask.execute({ name: "x", artifactIds: [own.id, own.id] }, actor)).rejects.toThrow(
      `Duplicate artifact link: ${own.id}`,
    );
  });
});

describe("hierarchy with other tasks", () => {
  test("`parentTaskId` and `subtaskIds` put the new task in the hierarchy, read back from both sides", async () => {
    const kit = setup({ tasks: [humanTask("parent-1"), humanTask("child-1")] });

    const { taskId } = await kit.createTask.execute(
      { name: "Reforma", status: "todo", parentTaskId: "parent-1", subtaskIds: ["child-1"] },
      actor,
    );

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved?.parentId).toBe("parent-1");
    expect(saved?.subtaskIds).toEqual(["child-1"]);
    expect((await kit.taskRepository.findById("parent-1"))?.subtaskIds).toEqual([taskId]);
    expect((await kit.taskRepository.findById("child-1"))?.parentId).toBe(taskId);
    expect(kit.database.edges).toEqual([
      { parentId: "parent-1", subtaskId: taskId },
      { parentId: taskId, subtaskId: "child-1" },
    ]);
  });

  test("the hierarchy travels in the batch and no other task is revised", async () => {
    const kit = setup({
      tasks: [humanTask("parent-1"), humanTask("child-1", { status: "doing" }), humanTask("child-2")],
    });

    const { taskId } = await kit.createTask.execute(
      { name: "Pintar parede", status: "todo", parentTaskId: "parent-1", subtaskIds: ["child-1", "child-2"] },
      actor,
    );

    expect(kit.batchWriter.commits).toHaveLength(1);
    const [batch] = kit.batchWriter.commits;
    expect(batch?.tasks.map((change) => change.op)).toEqual(["create"]);
    expect(batch?.subtasks).toEqual([
      { op: "add", parentId: "parent-1", subtaskId: taskId },
      { op: "add", parentId: taskId, subtaskId: "child-1" },
      { op: "add", parentId: taskId, subtaskId: "child-2" },
    ]);
    for (const id of ["parent-1", "child-1", "child-2"]) {
      expect((await kit.taskRepository.findById(id))?.revision).toBe(1);
    }
    expect((await kit.taskRepository.findById(taskId))?.revision).toBe(1);
  });

  test("a new task without them is outside any hierarchy", async () => {
    const kit = setup({ tasks: [humanTask("other")] });

    const { taskId } = await kit.createTask.execute({ name: "Solta", status: "todo" }, actor);

    const saved = await kit.taskRepository.findById(taskId);
    expect(saved?.parentId).toBeUndefined();
    expect(saved?.subtaskIds).toEqual([]);
    expect(kit.batchWriter.commits[0]?.subtasks).toEqual([]);
    expect(kit.database.edges).toEqual([]);
  });

  test("a task repeated in the subtask list becomes a single edge", async () => {
    const kit = setup({ tasks: [humanTask("child-1")] });

    const { taskId } = await kit.createTask.execute(
      { name: "Principal", status: "todo", subtaskIds: ["child-1", "child-1"] },
      actor,
    );

    expect(kit.database.edges).toEqual([{ parentId: taskId, subtaskId: "child-1" }]);
    expect((await kit.taskRepository.findById(taskId))?.subtaskIds).toEqual(["child-1"]);
  });

  test("a subtask that was under another main task moves to the new one", async () => {
    const kit = setup({ tasks: [humanTask("old-parent"), humanTask("child-1")] });
    kit.database.edges.push({ parentId: "old-parent", subtaskId: "child-1" });

    const { taskId } = await kit.createTask.execute({ name: "Nova principal", status: "todo", subtaskIds: ["child-1"] }, actor);

    expect(kit.database.edges).toEqual([{ parentId: taskId, subtaskId: "child-1" }]);
    expect((await kit.taskRepository.findById("old-parent"))?.revision).toBe(1);
  });

  test("touching an occurrence of a series in the hierarchy does not detach it", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const kit = setup({ tasks: [humanTask("parent-1", { occurrence })] });

    await kit.createTask.execute({ name: "Filha", status: "todo", parentTaskId: "parent-1" }, actor);

    const parent = await kit.taskRepository.findById("parent-1");
    expect(parent?.occurrence).toEqual(occurrence);
    expect(parent?.revision).toBe(1);
  });

  test("a agent task can be on either end of the hierarchy", async () => {
    const request = Task.create({ id: "request-1", userId: actor.userId, actor: "agent", kind: "request", status: "queued", name: "Pedido" });
    const kit = setup({ tasks: [request] });

    const { taskId } = await kit.createTask.execute(
      { name: "Parte do pedido", status: "todo", parentTaskId: "request-1" },
      actor,
    );
    const { taskId: parentId } = await kit.createTask.execute(
      { name: "Acima do pedido", status: "todo", subtaskIds: ["request-1"] },
      actor,
    );

    expect((await kit.taskRepository.findById("request-1"))?.parentId).toBe(parentId);
    expect((await kit.taskRepository.findById("request-1"))?.subtaskIds).toEqual([taskId]);
    expect((await kit.taskRepository.findById("request-1"))?.revision).toBe(1);
  });

  test("refuses an end that does not exist or belongs to someone else", async () => {
    const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const kit = setup({ tasks: [theirs] });
    const create = (input: { parentTaskId?: string; subtaskIds?: string[] }) =>
      kit.createTask.execute({ name: "Filha", status: "todo", ...input }, actor);

    await expect(create({ parentTaskId: "missing" })).rejects.toThrow(TaskNotFoundError);
    await expect(create({ subtaskIds: ["missing"] })).rejects.toThrow(TaskNotFoundError);
    await expect(create({ parentTaskId: "theirs" })).rejects.toThrow(TaskOwnershipError);
    await expect(create({ subtaskIds: ["theirs"] })).rejects.toThrow(TaskOwnershipError);
    expect(kit.database.tasks).toHaveLength(1);
    expect(kit.database.edges).toEqual([]);
    expect(kit.batchWriter.commits).toEqual([]);
  });

  test("refuses a hierarchy that closes a cycle", async () => {
    const kit = setup({ tasks: [humanTask("first"), humanTask("second")] });
    kit.database.edges.push({ parentId: "second", subtaskId: "first" });

    // first -> nova -> second, mas second ja e principal de first.
    await expect(
      kit.createTask.execute({ name: "No meio", status: "todo", parentTaskId: "first", subtaskIds: ["second"] }, actor),
    ).rejects.toThrow("A task cannot be a subtask of its own subtask");
  });

  test("an end that was deleted between preparing and saving refuses the batch", async () => {
    const kit = setup({ tasks: [humanTask("parent-1")] });
    const prepared = await kit.createTask.prepare({ name: "Filha", status: "todo", parentTaskId: "parent-1" }, actor);
    await kit.taskRepository.delete("parent-1", actor.userId);

    await expect(kit.createTask.save(prepared)).rejects.toThrow(TaskValidationError);

    expect(kit.database.edges).toEqual([]);
  });
});

describe("prepare and toEntityBatch", () => {
  test("prepare writes nothing", async () => {
    const kit = setup({ tasks: [humanTask("before-1")] });

    await kit.createTask.prepare({ kind: "meal", parentTaskId: "before-1" }, actor);

    expect(kit.database.tasks).toHaveLength(1);
    expect(kit.database.edges).toEqual([]);
    expect(kit.database.artifacts).toEqual([]);
    expect(kit.batchWriter.commits).toEqual([]);
  });

  test("the batch creates the artifacts and the task and carries the hierarchy, with no other task touched", async () => {
    const original = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ tasks: [humanTask("before-1"), humanTask("after-1")], artifacts: [original] });
    const prepared = await kit.createTask.prepare(
      { artifacts: [{ copyOf: original.id }], parentTaskId: "before-1", subtaskIds: ["after-1"] },
      actor,
    );

    const batch = toEntityBatch(prepared);

    expect(batch.userId).toBe("auth-user-1");
    expect(batch.artifacts).toEqual([{ op: "create", entity: prepared.artifacts[0] }]);
    expect(batch.derivations).toEqual([{ originalId: original.id, copyId: prepared.artifacts[0]?.id }]);
    expect(batch.tasks).toEqual([{ op: "create", entity: prepared.task }]);
    expect(prepared.subtasks).toEqual([
      { op: "add", parentId: "before-1", subtaskId: prepared.task.id },
      { op: "add", parentId: prepared.task.id, subtaskId: "after-1" },
    ]);
    expect(batch.subtasks).toEqual(prepared.subtasks);
  });

  test("buildArtifact builds what the task creation would, owned by the actor", async () => {
    const kit = setup();

    const food = await kit.createTask.buildArtifact({ type: "food", data: { inputText: "banana" } }, actor, now);

    expect(food).toMatchObject({ type: "food", userId: "auth-user-1", name: "Almoço" });
    expect(food.data).toMatchObject({ generation: { status: "pending" } });
    expect(kit.database.artifacts).toEqual([]);
  });
});

describe("location", () => {
  test("a task is born without a location unless someone informs one", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Corrida" }, actor);

    expect((await kit.taskRepository.findById(taskId))?.location).toBeUndefined();
  });

  test("the location someone informed is kept, trimmed", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Corrida", location: "  Parque Ibirapuera " }, actor);

    expect((await kit.taskRepository.findById(taskId))?.location).toBe("Parque Ibirapuera");
  });
});

describe("project", () => {
  test("a task created with a projectId is prepared and saved in that project", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Escrever", projectId: "project-1" }, actor);

    expect((await kit.taskRepository.findById(taskId))?.projectId).toBe("project-1");
    expect(kit.batchWriter.commits[0]?.tasks).toMatchObject([{ op: "create", entity: { projectId: "project-1" } }]);
  });

  test("without a projectId the task carries none, so the writer resolves personal", async () => {
    const kit = setup();

    const { taskId } = await kit.createTask.execute({ name: "Escrever" }, actor);

    expect((await kit.taskRepository.findById(taskId))?.projectId).toBeUndefined();
  });

  test("an occurrence rehearsal keeps the project the template carries", async () => {
    const kit = setup();

    const prepared = await kit.createTask.prepare({ name: "Correr", projectId: "project-1" }, actor);

    expect(prepared.task.projectId).toBe("project-1");
  });
});
