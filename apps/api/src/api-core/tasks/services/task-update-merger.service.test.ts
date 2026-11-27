import { describe, expect, test } from "vitest";
import type { UpdateTaskInput } from "@repo/contracts";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskValidationError,
  type FoodData,
} from "../../../domain/index";
import { taskWith, type TaskFixture } from "../testing/task-fixtures";
import { createTasksKit } from "../testing/in-memory-tasks-kit";
import { mergeTaskUpdate, toUpdateBatch } from "./task-update-merger.service";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");
const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};
const foodData = { description: "arroz branco", items: [], totals: { ...zeroTotals, totalCaloriesKcal: 130 } };

function setup(fixtures: TaskFixture[], extra: { tasks?: Task[]; artifacts?: Artifact[] } = {}) {
  const kit = createTasksKit({
    tasks: [...fixtures.map((fixture) => fixture.task), ...(extra.tasks ?? [])],
    artifacts: [...fixtures.flatMap((fixture) => fixture.artifacts), ...(extra.artifacts ?? [])],
  });
  const merge = async (taskId: string, input: Omit<UpdateTaskInput, "taskId" | "expectedRevision">) => {
    const existing = (await kit.taskRepository.findById(taskId)) as Task;
    return mergeTaskUpdate(
      existing,
      { taskId: taskId, expectedRevision: existing.revision, ...input },
      { artifactBuilder: kit.artifactBuilder, artifactRepository: kit.artifactRepository, taskRepository: kit.taskRepository },
    );
  };
  return { ...kit, merge };
}

function meeting(artifacts: Parameters<typeof taskWith>[1] = []): TaskFixture {
  return taskWith({ id: "task-1", userId, name: "Reunião", description: "Semanal", startedAt, tags: ["trabalho"] }, artifacts);
}

describe("fields", () => {
  test("changes what was sent, keeps the rest and bumps the revision", async () => {
    const { merge } = setup([meeting()]);

    const { task, artifacts, subtasks } = await merge("task-1", {
      name: "Retrospectiva",
      priority: "high",
      tags: ["Time"],
      notifyOffsetsMinutes: [30],
      status: "doing",
      startedAt: "2026-08-18T15:00:00.000Z",
      estimatedFinishAt: "2026-08-18T16:30:00.000Z",
      finishedAt: "2026-08-18T16:10:00.000Z",
    });

    expect(task).toMatchObject({
      id: "task-1",
      name: "Retrospectiva",
      description: "Semanal",
      kind: "common",
      priority: "high",
      tags: ["time"],
      notifyOffsetsMinutes: [30],
      status: "doing",
      revision: 2,
    });
    expect(task.startedAt?.toISOString()).toBe("2026-08-18T15:00:00.000Z");
    expect(task.estimatedFinishAt?.toISOString()).toBe("2026-08-18T16:30:00.000Z");
    expect(task.finishedAt?.toISOString()).toBe("2026-08-18T16:10:00.000Z");
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
    expect(subtasks).toEqual([]);
  });

  test("an empty change is still a revision of the task", async () => {
    const { merge } = setup([meeting([{ type: "text", data: { body: "pauta" } }])]);

    const { task } = await merge("task-1", {});

    expect(task.revision).toBe(2);
    expect(task.name).toBe("Reunião");
    expect(task.artifactLinks).toHaveLength(1);
  });

  test("null clears the status and the dates", async () => {
    const tracked = taskWith({
      id: "task-1",
      userId,
      name: "Entregar relatório",
      status: "done",
      startedAt,
      estimatedFinishAt: new Date("2026-08-17T16:00:00.000Z"),
      finishedAt: new Date("2026-08-17T15:50:00.000Z"),
    });
    const { merge } = setup([tracked]);

    const dates = await merge("task-1", { startedAt: null, estimatedFinishAt: null, finishedAt: null });
    const status = await merge("task-1", { status: null });

    expect(dates.task.startedAt).toBeUndefined();
    expect(dates.task.estimatedFinishAt).toBeUndefined();
    expect(dates.task.finishedAt).toBeUndefined();
    expect(dates.task.status).toBe("done");
    expect(status.task.status).toBeUndefined();
    expect(status.task.isReference).toBe(true);
  });

  test("a reference task cannot lose its start", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("task-1", { startedAt: null })).rejects.toThrow("A reference task requires startedAt");
  });

  test("rejects an invalid date, an unknown kind and an unknown status", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("task-1", { startedAt: "amanha" })).rejects.toThrow("Invalid date");
    await expect(merge("task-1", { finishedAt: "x" })).rejects.toThrow(TaskValidationError);
    await expect(merge("task-1", { kind: "step" as never })).rejects.toThrow("Unknown task kind: step");
    await expect(merge("task-1", { status: "running" as never })).rejects.toThrow("Unknown task status: running");
  });

  test("turns a tracked task into a long-running one", async () => {
    const fixture = taskWith({ id: "task-1", userId, name: "Reforma", status: "todo" });
    const { merge } = setup([fixture]);

    expect((await merge("task-1", { longRunning: true })).task.longRunning).toBe(true);
  });

  test("detaches an occurrence from its series", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const { merge } = setup([taskWith({ id: "task-1", userId, name: "Correr", startedAt, occurrence })]);

    expect((await merge("task-1", { description: "na esteira" })).task.occurrence?.detached).toBe(true);
  });
});

describe("project", () => {
  const inProject = () => taskWith({ id: "task-1", userId, name: "Reunião", startedAt, projectId: "project-1" });

  test("absent keeps the project, a projectId swaps it and null goes back to personal", async () => {
    const { merge } = setup([inProject()]);

    expect((await merge("task-1", { name: "Outro" })).task.projectId).toBe("project-1");
    expect((await merge("task-1", { projectId: "project-2" })).task.projectId).toBe("project-2");
    expect((await merge("task-1", { projectId: null })).task.projectId).toBeNull();
  });

  test("changing the project is an ordinary edit: it bumps the revision and detaches the occurrence", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const { merge } = setup([taskWith({ id: "task-1", userId, name: "Reunião", startedAt, projectId: "project-1", occurrence })]);

    const { task } = await merge("task-1", { projectId: "project-2" });

    expect(task).toMatchObject({ revision: 2, projectId: "project-2", occurrence: { detached: true } });
  });

  test("the batch carries the revised task with its project, against the revision that was read", async () => {
    const { merge } = setup([inProject()]);

    const merged = await merge("task-1", { projectId: null });

    expect(toUpdateBatch(merged, 1).tasks).toMatchObject([{ op: "update", expectedRevision: 1, entity: { projectId: null } }]);
  });
});

describe("list of artifacts", () => {
  const twoNotes = () => meeting([
    { id: "note-1", type: "text", data: { body: "pauta" } },
    { id: "note-2", type: "text", data: { body: "ata" } },
  ]);

  test("absent, the artifacts of the task stay as they are", async () => {
    const { merge } = setup([twoNotes()]);

    const { task, artifacts } = await merge("task-1", { name: "Outra" });

    expect(task.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", "note-2"]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("an entry with only the id keeps the artifact and its relation, without editing it", async () => {
    const { merge } = setup([twoNotes()]);

    const { task, artifacts } = await merge("task-1", { artifacts: [{ id: "note-2" }, { id: "note-1" }] });

    expect(task.artifactLinks).toEqual([
      { artifactId: "note-2", relation: "creates", fromRecurrence: false },
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
    ]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("an artifact left out of the list leaves the task but is not deleted", async () => {
    const kit = setup([twoNotes()]);

    const merged = await kit.merge("task-1", { artifacts: [{ id: "note-2" }] });
    await kit.batchWriter.commit(toUpdateBatch(merged, 1));

    expect(merged.task.artifactLinks.map((link) => link.artifactId)).toEqual(["note-2"]);
    expect(kit.database.artifacts.map((artifact) => artifact.id)).toEqual(["note-1", "note-2"]);
    expect((await kit.artifactRepository.findById("note-1"))?.revision).toBe(1);
  });

  test("an empty list removes every artifact from the task", async () => {
    const { merge } = setup([twoNotes()]);

    expect((await merge("task-1", { artifacts: [] })).task.artifactLinks).toEqual([]);
  });

  test("an entry with id and data edits the artifact at the revision that was read", async () => {
    const { merge } = setup([twoNotes()]);

    const { task, artifacts } = await merge("task-1", {
      artifacts: [{ id: "note-1", type: "text", data: { body: "pauta revisada" }, name: "Pauta", tags: ["Time"] }, { id: "note-2" }],
    });

    expect(artifacts.created).toEqual([]);
    expect(artifacts.updated).toHaveLength(1);
    expect(artifacts.updated[0]?.expectedRevision).toBe(1);
    expect(artifacts.updated[0]?.artifact).toMatchObject({
      id: "note-1",
      name: "Pauta",
      tags: ["time"],
      data: { body: "pauta revisada" },
      revision: 2,
    });
    expect(task.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", "note-2"]);
  });

  test("an entry with id and only a name or tags edits just that", async () => {
    const { merge } = setup([twoNotes()]);

    const { artifacts } = await merge("task-1", { artifacts: [{ id: "note-1", name: "Pauta" }, { id: "note-2", tags: ["ata"] }] });

    expect(artifacts.updated.map(({ artifact }) => [artifact.id, artifact.name, artifact.tags, artifact.data])).toEqual([
      ["note-1", "Pauta", [], { body: "pauta" }],
      ["note-2", "ata", ["ata"], { body: "ata" }],
    ]);
  });

  test("an edited training has its workout names and calories recalculated", async () => {
    const training = taskWith({ id: "task-1", userId, name: "Treino", startedAt }, [
      { id: "training-1", type: "training", data: { workouts: [], caloriesBurned: 0 } },
    ]);
    const { merge } = setup([training]);

    const { artifacts } = await merge("task-1", {
      artifacts: [
        {
          id: "training-1",
          type: "training",
          data: {
            workouts: [{ id: "w1", workoutCode: "free", workoutName: "Qualquer", calories: 200, duration: 30 }],
            caloriesBurned: 9999,
          },
        },
      ],
    });

    expect(artifacts.updated[0]?.artifact.data).toEqual({
      workouts: [{ id: "w1", workoutCode: "free", workoutName: "Livre", calories: 200, duration: 30 }],
      caloriesBurned: 200,
    });
  });

  test("an entry without id creates a new artifact, created by the task unless said otherwise", async () => {
    const { merge } = setup([twoNotes()]);

    const { task, artifacts } = await merge("task-1", {
      artifacts: [
        { id: "note-1" },
        { type: "text", data: { body: "decisões" }, name: "Decisões" },
        { type: "sleep", data: { trackedSleepTime: 400, score: 70 }, relation: "updates" },
      ],
    });

    expect(artifacts.created.map((artifact) => [artifact.type, artifact.name, artifact.userId, artifact.revision])).toEqual([
      ["text", "Decisões", userId, 1],
      ["sleep", "Sono", userId, 1],
    ]);
    expect(task.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: artifacts.created[0]?.id, relation: "creates", fromRecurrence: false },
      { artifactId: artifacts.created[1]?.id, relation: "updates", fromRecurrence: false },
    ]);
    expect(artifacts.updated).toEqual([]);
  });

  test("a new artifact requires data, and a new food cannot bring generation metadata", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("task-1", { artifacts: [{ name: "vazio" } as never] })).rejects.toThrow(
      "A new artifact requires data",
    );
    await expect(
      merge("task-1", { artifacts: [{ type: "food", data: { ...foodData, nutritionSource: "model-estimate" } }] }),
    ).rejects.toThrow("Food generation metadata is server-owned");
    await expect(
      merge("task-1", { artifacts: [{ type: "food", data: { ...foodData, generation: { status: "pending" } } }] }),
    ).rejects.toThrow("Only food creation can schedule the nutrient calculation");
  });

  test("`copyOf` creates a derived copy with the quantity and never touches the original", async () => {
    const original = Artifact.create({ id: "food-1", userId, type: "food", name: "Arroz", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [original] });

    const { task, artifacts } = await merge("task-1", { artifacts: [{ copyOf: "food-1", quantity: "1 prato" }] });

    const [copy] = artifacts.created;
    expect(copy).toMatchObject({ type: "food", name: "Arroz", derived: true, userId });
    expect(copy?.id).not.toBe("food-1");
    expect(copy?.data).toEqual({ ...foodData, quantity: "1 prato" });
    expect(artifacts.derivations).toEqual([{ originalId: "food-1", copyId: copy?.id }]);
    expect(artifacts.updated).toEqual([]);
    expect(task.artifactLinks).toEqual([{ artifactId: copy?.id, relation: "uses", fromRecurrence: false }]);
    expect(original.revision).toBe(1);
  });

  test("an artifact of the user, or a global one, that was not in the task enters as used", async () => {
    const own = Artifact.create({ id: "own-1", userId, data: { body: "checklist" } });
    const global = Artifact.create({ id: "global-1", type: "food", name: "Banana", data: foodData });
    const { merge } = setup([twoNotes()], { artifacts: [own, global] });

    const { task, artifacts } = await merge("task-1", {
      artifacts: [{ id: "note-1" }, { id: "own-1" }, { id: "global-1", relation: "updates" }],
    });

    expect(task.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: "own-1", relation: "uses", fromRecurrence: false },
      { artifactId: "global-1", relation: "updates", fromRecurrence: false },
    ]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("the relation of an artifact already in the task can be changed", async () => {
    const { merge } = setup([twoNotes()]);

    const { task } = await merge("task-1", { artifacts: [{ id: "note-1", relation: "uses" }] });

    expect(task.artifactLinks).toEqual([{ artifactId: "note-1", relation: "uses", fromRecurrence: false }]);
  });

  test("a link inherited from the series stays from the series, even when the artifact is edited here", async () => {
    const note = Artifact.create({ id: "series-note", userId, data: { body: "alongar" } });
    const own = Artifact.create({ id: "own-note", userId, data: { body: "so hoje" } });
    const occurrence = Task.create({
      id: "task-1",
      userId,
      name: "Correr",
      startedAt,
      artifactLinks: [
        { artifactId: "series-note", relation: "uses", fromRecurrence: true },
        { artifactId: "own-note", relation: "creates", fromRecurrence: false },
      ],
      occurrence: { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false },
    });
    const { merge } = setup([], { tasks: [occurrence], artifacts: [note, own] });

    const { task, artifacts } = await merge("task-1", {
      artifacts: [{ id: "own-note" }, { id: "series-note", type: "text", data: { body: "alongar 10 min" } }],
    });

    expect(task.artifactLinks).toEqual([
      { artifactId: "own-note", relation: "creates", fromRecurrence: false },
      { artifactId: "series-note", relation: "uses", fromRecurrence: true },
    ]);
    expect(artifacts.updated[0]?.artifact.data).toEqual({ body: "alongar 10 min" });
  });

  test("refuses an artifact that does not exist or belongs to someone else, as id or as copyOf", async () => {
    const theirs = Artifact.create({ id: "theirs", userId: "someone-else", type: "food", name: "Arroz", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [theirs] });

    await expect(merge("task-1", { artifacts: [{ id: "missing" }] })).rejects.toThrow(ArtifactNotFoundError);
    await expect(merge("task-1", { artifacts: [{ copyOf: "missing" }] })).rejects.toThrow("Artifact not found: missing");
    await expect(merge("task-1", { artifacts: [{ id: "theirs" }] })).rejects.toThrow(ArtifactOwnershipError);
    await expect(merge("task-1", { artifacts: [{ copyOf: "theirs" }] })).rejects.toThrow(ArtifactOwnershipError);
  });

  test("a global artifact can be kept in the task but not edited through it", async () => {
    const global = Artifact.create({ id: "global-1", type: "food", name: "Banana", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [global] });

    await expect(merge("task-1", { artifacts: [{ id: "global-1", name: "Minha banana" }] })).rejects.toThrow(
      "A global artifact cannot be edited",
    );
  });

  test("the same artifact cannot be listed twice", async () => {
    const { merge } = setup([twoNotes()]);

    await expect(merge("task-1", { artifacts: [{ id: "note-1" }, { id: "note-1" }] })).rejects.toThrow(
      "Duplicate artifact link: note-1",
    );
  });
});

describe("a meal task always has a food", () => {
  const descriptionOf = (artifact: Artifact | undefined) => (artifact?.data as FoodData | undefined)?.description;

  test("a task that becomes a meal gets a pending food from its description", async () => {
    const { merge } = setup([meeting([{ id: "note-1", type: "text", data: { body: "pauta" } }])]);

    const { task, artifacts } = await merge("task-1", { kind: "meal" });

    const [food] = artifacts.created;
    expect(food).toMatchObject({ type: "food", userId, revision: 1 });
    expect(food?.data).toMatchObject({ description: "Semanal", items: [], generation: { status: "pending" } });
    expect(task.kind).toBe("meal");
    expect(task.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: food?.id, relation: "creates", fromRecurrence: false },
    ]);
  });

  test("the pending food uses the new description, or the name when there is none", async () => {
    const plain = taskWith({ id: "task-1", userId, name: "Lanche", startedAt });
    const { merge } = setup([plain]);

    const described = await merge("task-1", { kind: "meal", description: "  pão com ovo " });
    const named = await merge("task-1", { kind: "meal", name: "Tapioca" });
    const bare = await merge("task-1", { kind: "meal" });

    expect(descriptionOf(described.artifacts.created[0])).toBe("pão com ovo");
    expect(descriptionOf(named.artifacts.created[0])).toBe("Tapioca");
    expect(descriptionOf(bare.artifacts.created[0])).toBe("Lanche");
  });

  test("a meal that already has a food gets no other, whatever is edited", async () => {
    const meal = taskWith({ id: "task-1", userId, name: "Almoço", startedAt }, [{ id: "food-1", type: "food", data: foodData }]);
    const { merge } = setup([meal]);

    const renamed = await merge("task-1", { name: "Almoço de domingo" });
    const kept = await merge("task-1", { artifacts: [{ id: "food-1" }] });

    expect(renamed.task.kind).toBe("meal");
    expect(renamed.artifacts.created).toEqual([]);
    expect(kept.artifacts.created).toEqual([]);
    expect(kept.task.artifactLinks.map((link) => link.artifactId)).toEqual(["food-1"]);
  });

  test("a food that enters through the list counts: new, copied or edited", async () => {
    const meal = taskWith({ id: "task-1", userId, name: "Almoço", startedAt }, [{ id: "food-1", type: "food", data: foodData }]);
    const other = Artifact.create({ id: "food-2", userId, type: "food", name: "Feijão", data: foodData });
    const { merge } = setup([meal], { artifacts: [other] });

    const created = await merge("task-1", { artifacts: [{ type: "food", data: foodData }] });
    const copied = await merge("task-1", { artifacts: [{ copyOf: "food-2" }] });
    const edited = await merge("task-1", { artifacts: [{ id: "food-1", type: "food", data: { ...foodData, description: "arroz integral" } }] });

    expect(created.artifacts.created).toHaveLength(1);
    expect(copied.artifacts.created).toHaveLength(1);
    expect(edited.artifacts.created).toEqual([]);
    expect(edited.task.artifactLinks).toHaveLength(1);
  });

  test("a meal whose foods all left the list gets a new pending one, after what stayed", async () => {
    const meal = taskWith({ id: "task-1", userId, name: "Almoço", description: "feijoada", startedAt }, [
      { id: "food-1", type: "food", data: foodData },
      { id: "note-1", type: "text", data: { body: "estava bom" } },
    ]);
    const { merge } = setup([meal]);

    const { task, artifacts } = await merge("task-1", { artifacts: [{ id: "note-1" }] });

    expect(artifacts.created).toHaveLength(1);
    expect(descriptionOf(artifacts.created[0])).toBe("feijoada");
    expect(task.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", artifacts.created[0]?.id]);
  });

  test("a meal that stops being one gets no food", async () => {
    const meal = taskWith({ id: "task-1", userId, name: "Almoço", startedAt, kind: "meal" });
    const { merge } = setup([meal]);

    const { task, artifacts } = await merge("task-1", { kind: "common" });

    expect(task.kind).toBe("common");
    expect(artifacts.created).toEqual([]);
  });
});

describe("hierarchy (the main task and the subtasks)", () => {
  // p1 -> child -> s1, s2; p2, p3 e s3 soltas.
  function tree() {
    const child = taskWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const other = (id: string) => Task.create({ id, userId, name: id, status: "todo" });
    const kit = setup([child], { tasks: ["p1", "p2", "s1", "s2", "s3"].map(other) });
    kit.database.edges.push(
      { parentId: "p1", subtaskId: "child" },
      { parentId: "child", subtaskId: "s1" },
      { parentId: "child", subtaskId: "s2" },
    );
    return kit;
  }

  test("reads the hierarchy of the task from the database", async () => {
    const { merge } = tree();

    const { task } = await merge("child", { name: "Pintar a sala" });

    expect(task.parentId).toBe("p1");
    expect(task.subtaskIds).toEqual(["s1", "s2"]);
  });

  test("absent, the hierarchy does not change", async () => {
    const { merge } = tree();

    const { subtasks } = await merge("child", { name: "Pintar a sala" });

    expect(subtasks).toEqual([]);
  });

  test("sending the same main task and subtasks changes nothing", async () => {
    const { merge } = tree();

    const { subtasks } = await merge("child", { parentTaskId: "p1", subtaskIds: ["s2", "s1"] });

    expect(subtasks).toEqual([]);
  });

  test("plans only the edges that were gained or lost, on either side", async () => {
    const { merge } = tree();

    const { subtasks } = await merge("child", { parentTaskId: "p2", subtaskIds: ["s2", "s3"] });

    expect(subtasks).toEqual([
      { op: "remove", parentId: "p1", subtaskId: "child" },
      { op: "add", parentId: "p2", subtaskId: "child" },
      { op: "add", parentId: "child", subtaskId: "s3" },
      { op: "remove", parentId: "child", subtaskId: "s1" },
    ]);
  });

  test("an empty list removes every subtask and leaves the main task alone", async () => {
    const { merge } = tree();

    const { subtasks } = await merge("child", { subtaskIds: [] });

    expect(subtasks).toEqual([
      { op: "remove", parentId: "child", subtaskId: "s1" },
      { op: "remove", parentId: "child", subtaskId: "s2" },
    ]);
  });

  test("changing the hierarchy revises only the edited task, never the ends", async () => {
    const kit = tree();

    const merged = await kit.merge("child", { parentTaskId: "p2", subtaskIds: [] });
    await kit.batchWriter.commit(toUpdateBatch(merged, 1));

    const child = await kit.taskRepository.findById("child");
    expect(child?.parentId).toBe("p2");
    expect(child?.subtaskIds).toEqual([]);
    expect(child?.revision).toBe(2);
    for (const id of ["p1", "p2", "s1", "s2"]) {
      expect((await kit.taskRepository.findById(id))?.revision).toBe(1);
    }
    expect((await kit.taskRepository.findById("p2"))?.subtaskIds).toEqual(["child"]);
    expect((await kit.taskRepository.findById("p1"))?.subtaskIds).toEqual([]);
  });

  test("a agent task can be on either end", async () => {
    const child = taskWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const request = Task.create({ id: "request-1", userId, actor: "agent", kind: "request", status: "queued", name: "Pedido" });
    const { merge } = setup([child], { tasks: [request] });

    const asParent = await merge("child", { parentTaskId: "request-1" });
    const asSubtask = await merge("child", { subtaskIds: ["request-1"] });

    expect(asParent.subtasks).toEqual([{ op: "add", parentId: "request-1", subtaskId: "child" }]);
    expect(asSubtask.subtasks).toEqual([{ op: "add", parentId: "child", subtaskId: "request-1" }]);
  });

  test("refuses an end that does not exist, belongs to someone else or is the task itself", async () => {
    const child = taskWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const { merge } = setup([child], { tasks: [theirs] });

    await expect(merge("child", { parentTaskId: "missing" })).rejects.toThrow(TaskNotFoundError);
    await expect(merge("child", { subtaskIds: ["theirs"] })).rejects.toThrow(TaskOwnershipError);
    await expect(merge("child", { parentTaskId: "child" })).rejects.toThrow("A task cannot be its own subtask");
    await expect(merge("child", { subtaskIds: ["child"] })).rejects.toThrow(TaskValidationError);
  });

  test("refuses a change that closes a cycle when it is written", async () => {
    const kit = tree();
    // child -> s1 ja existe: s1 nao pode ser a principal de child.
    const merged = await kit.merge("child", { parentTaskId: "s1" });

    expect(() => kit.database.apply(userId, merged.subtasks)).toThrow("A task cannot be a subtask of its own subtask");
  });
});

describe("toUpdateBatch", () => {
  test("carries the task at the expected revision, the artifacts and the hierarchy, without other tasks", async () => {
    const original = Artifact.create({ id: "food-1", userId, type: "food", name: "Arroz", data: foodData });
    const parent = Task.create({ id: "parent", userId, name: "Projeto", status: "todo" });
    const kit = setup([meeting([{ id: "note-1", type: "text", data: { body: "pauta" } }])], {
      tasks: [parent],
      artifacts: [original],
    });
    const merged = await kit.merge("task-1", {
      artifacts: [{ id: "note-1", name: "Pauta" }, { copyOf: "food-1" }],
      parentTaskId: "parent",
    });

    const batch = toUpdateBatch(merged, 1);

    expect(batch.userId).toBe(userId);
    expect(batch.artifacts).toEqual([
      { op: "create", entity: merged.artifacts.created[0] },
      { op: "update", entity: merged.artifacts.updated[0]?.artifact, expectedRevision: 1 },
    ]);
    expect(batch.derivations).toEqual([{ originalId: "food-1", copyId: merged.artifacts.created[0]?.id }]);
    expect(batch.tasks).toEqual([{ op: "update", entity: merged.task, expectedRevision: 1 }]);
    expect(batch.subtasks).toEqual([{ op: "add", parentId: "parent", subtaskId: "task-1" }]);
  });
});
