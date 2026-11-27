import { expect, test } from "vitest";
import {
  Artifact,
  EntityBatchConflictError,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
} from "../../domain/index";
import { createTasksKit, type TasksKitOptions } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { UpdateTaskUseCase } from "./update-task.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function setup(options: TasksKitOptions) {
  const kit = createTasksKit(options);
  const useCase = new UpdateTaskUseCase(kit.taskRepository, kit.artifactRepository, kit.artifactBuilder, kit.batchWriter);
  return { ...kit, useCase };
}

function meeting(overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id: "task-1", userId: actor.userId, name: "Reunião", startedAt, ...overrides });
}

test("updates the task and bumps its revision", async () => {
  const { useCase, taskRepository } = setup({ tasks: [meeting()] });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, name: "Retrospectiva", status: "doing", tags: ["Time"] }, actor);

  expect(await taskRepository.findById("task-1")).toMatchObject({
    name: "Retrospectiva",
    status: "doing",
    tags: ["time"],
    revision: 2,
  });
});

test("null turns a tracked task back into a reference one", async () => {
  const { useCase, taskRepository } = setup({ tasks: [meeting({ status: "todo" })] });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, status: null }, actor);

  expect((await taskRepository.findById("task-1"))?.status).toBeUndefined();
});

test("the task, the edited and the new artifacts are written in one batch", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "pauta" } });
  const task = meeting({ artifactLinks: [{ artifactId: "note-1", relation: "creates", fromRecurrence: false }] });
  const { useCase, taskRepository, artifactRepository, batchWriter, database } = setup({ tasks: [task], artifacts: [note] });

  await useCase.execute(
    {
      taskId: "task-1",
      expectedRevision: 1,
      artifacts: [{ id: "note-1", type: "text", data: { body: "pauta revisada" } }, { type: "text", data: { body: "ata" } }],
    },
    actor,
  );

  const saved = await taskRepository.findById("task-1");
  expect(batchWriter.commits).toHaveLength(1);
  expect(database.artifacts).toHaveLength(2);
  expect(await artifactRepository.findById("note-1")).toMatchObject({ data: { body: "pauta revisada" }, revision: 2 });
  expect(saved?.artifactLinks.map((link) => link.relation)).toEqual(["creates", "creates"]);
  expect(saved?.artifactLinks[1]?.artifactId).toBe(database.artifacts[1]?.id);
  expect(saved?.revision).toBe(2);
});

test("changing the hierarchy writes the edges in the same batch and revises only the edited task", async () => {
  const oldParent = Task.create({ id: "old", userId: actor.userId, name: "Antigo", status: "todo" });
  const newParent = Task.create({ id: "new", userId: actor.userId, name: "Novo", status: "todo" });
  const child = Task.create({ id: "child", userId: actor.userId, name: "Parte", status: "todo" });
  const { useCase, taskRepository, batchWriter, database } = setup({ tasks: [meeting(), oldParent, newParent, child] });
  database.edges.push({ parentId: "old", subtaskId: "task-1" });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, parentTaskId: "new", subtaskIds: ["child"] }, actor);

  expect(batchWriter.commits).toHaveLength(1);
  expect(batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["update"]);
  expect(batchWriter.commits[0]?.subtasks).toEqual([
    { op: "remove", parentId: "old", subtaskId: "task-1" },
    { op: "add", parentId: "new", subtaskId: "task-1" },
    { op: "add", parentId: "task-1", subtaskId: "child" },
  ]);
  expect(await taskRepository.findById("task-1")).toMatchObject({ parentId: "new", subtaskIds: ["child"], revision: 2 });
  expect(await taskRepository.findById("old")).toMatchObject({ subtaskIds: [], revision: 1 });
  expect(await taskRepository.findById("new")).toMatchObject({ subtaskIds: ["task-1"], revision: 1 });
  expect(await taskRepository.findById("child")).toMatchObject({ parentId: "task-1", revision: 1 });
});

test("a subtask taken from another main task moves: a task has a single main task", async () => {
  const other = Task.create({ id: "other", userId: actor.userId, name: "Outra", status: "todo" });
  const child = Task.create({ id: "child", userId: actor.userId, name: "Parte", status: "todo" });
  const { useCase, taskRepository, database } = setup({ tasks: [meeting(), other, child] });
  database.edges.push({ parentId: "other", subtaskId: "child" });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, subtaskIds: ["child"] }, actor);

  expect(database.edges).toEqual([{ parentId: "task-1", subtaskId: "child" }]);
  expect(await taskRepository.findById("other")).toMatchObject({ subtaskIds: [], revision: 1 });
  expect(await taskRepository.findById("child")).toMatchObject({ parentId: "task-1", revision: 1 });
});

test("null takes the task out from under its main task", async () => {
  const parent = Task.create({ id: "parent", userId: actor.userId, name: "Principal", status: "todo" });
  const { useCase, taskRepository, database } = setup({ tasks: [meeting(), parent] });
  database.edges.push({ parentId: "parent", subtaskId: "task-1" });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, parentTaskId: null }, actor);

  expect(database.edges).toEqual([]);
  expect(await taskRepository.findById("task-1")).toMatchObject({ parentId: undefined, revision: 2 });
});

test("an update without the hierarchy keeps it as it is", async () => {
  const before = Task.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const { useCase, taskRepository, batchWriter, database } = setup({ tasks: [meeting(), before] });
  database.edges.push({ parentId: "before", subtaskId: "task-1" });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, name: "Outro nome" }, actor);

  expect(batchWriter.commits[0]?.subtasks).toEqual([]);
  expect(await taskRepository.findById("task-1")).toMatchObject({ parentId: "before", name: "Outro nome", revision: 2 });
});

test("repeating the same main task is not a change of the hierarchy", async () => {
  const before = Task.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const { useCase, batchWriter, database } = setup({ tasks: [meeting(), before] });
  database.edges.push({ parentId: "before", subtaskId: "task-1" });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, parentTaskId: "before" }, actor);

  expect(batchWriter.commits[0]?.subtasks).toEqual([]);
  expect(database.edges).toEqual([{ parentId: "before", subtaskId: "task-1" }]);
});

test("a agent task can be the main task or a subtask of a human task, and is not revised", async () => {
  const request = Task.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { useCase, taskRepository, database } = setup({ tasks: [meeting(), request] });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, parentTaskId: "request" }, actor);
  await useCase.execute({ taskId: "task-1", expectedRevision: 2, parentTaskId: null, subtaskIds: ["request"] }, actor);

  expect(database.edges).toEqual([{ parentId: "task-1", subtaskId: "request" }]);
  expect(await taskRepository.findById("request")).toMatchObject({ parentId: "task-1", revision: 1 });
});

test("refuses a hierarchy that closes a cycle, and the task is not revised", async () => {
  const other = Task.create({ id: "other", userId: actor.userId, name: "Outro", status: "todo" });
  const { useCase, database } = setup({ tasks: [meeting(), other] });
  database.edges.push({ parentId: "task-1", subtaskId: "other" });

  await expect(
    useCase.execute({ taskId: "task-1", expectedRevision: 1, parentTaskId: "other" }, actor),
  ).rejects.toThrow("A task cannot be a subtask of its own subtask");
});

test("refuses a task that is its own subtask", async () => {
  const { useCase, batchWriter } = setup({ tasks: [meeting()] });

  await expect(
    useCase.execute({ taskId: "task-1", expectedRevision: 1, subtaskIds: ["task-1"] }, actor),
  ).rejects.toThrow("A task cannot be its own subtask");
  expect(batchWriter.commits).toEqual([]);
});

test("editing an occurrence detaches it from its series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { useCase, taskRepository } = setup({ tasks: [meeting({ occurrence })] });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, status: "missed" }, actor);

  expect(await taskRepository.findById("task-1")).toMatchObject({ status: "missed", occurrence: { detached: true } });
});

test("rejects a task that does not exist", async () => {
  const { useCase } = setup({});

  await expect(useCase.execute({ taskId: "missing", expectedRevision: 1, name: "x" }, actor)).rejects.toThrow(TaskNotFoundError);
});

test("rejects a task that belongs to another user, before looking at the revision", async () => {
  const { useCase, database, batchWriter } = setup({ tasks: [meeting()] });

  await expect(
    useCase.execute({ taskId: "task-1", expectedRevision: 99, name: "Invadido" }, { userId: "attacker-1" }),
  ).rejects.toThrow(TaskOwnershipError);
  expect(database.tasks[0]?.name).toBe("Reunião");
  expect(batchWriter.commits).toEqual([]);
});

test("rejects a stale revision before preparing or writing anything", async () => {
  const stored = Task.rehydrate({ id: "task-1", userId: actor.userId, actor: "human", kind: "common", name: "Reunião", startedAt, revision: 3, createdAt: startedAt, updatedAt: startedAt });
  const { useCase, database, batchWriter } = setup({ tasks: [stored] });

  await expect(
    // A lista de artefatos e invalida de proposito: o conflito de revisao vem antes de qualquer preparo.
    useCase.execute({ taskId: "task-1", expectedRevision: 2, name: "Atrasado", artifacts: [{ id: "missing" }] }, actor),
  ).rejects.toThrow(TaskRevisionConflictError);
  await expect(useCase.execute({ taskId: "task-1", expectedRevision: 2 }, actor)).rejects.toThrow(
    "Expected revision 2 but found 3",
  );
  expect(database.tasks[0]).toBe(stored);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing when the change is invalid", async () => {
  const { useCase, database, batchWriter } = setup({ tasks: [meeting()] });

  await expect(
    useCase.execute(
      { taskId: "task-1", expectedRevision: 1, artifacts: [{ type: "text", data: { body: "nova" } }], parentTaskId: "missing" },
      actor,
    ),
  ).rejects.toThrow(TaskNotFoundError);
  expect(database.artifacts).toEqual([]);
  expect(database.tasks[0]?.revision).toBe(1);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing, not even the hierarchy, when the edited task changed while it was being prepared", async () => {
  const before = Task.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const kit = setup({ tasks: [meeting(), before] });
  const findByIds = kit.taskRepository.findByIds.bind(kit.taskRepository);
  // Outra aba edita a propria tarefa logo depois de a ponta nova ser lida.
  kit.taskRepository.findByIds = async (ids) => {
    const found = await findByIds(ids);
    const current = (await kit.taskRepository.findById("task-1")) as Task;
    await kit.taskRepository.update(current.revise({ name: "Editado em outra aba" }), actor.userId, current.revision);
    return found;
  };

  await expect(
    kit.useCase.execute({ taskId: "task-1", expectedRevision: 1, name: "Nova", parentTaskId: "before" }, actor),
  ).rejects.toThrow(EntityBatchConflictError);

  expect(kit.database.tasks.find((task) => task.id === "task-1")).toMatchObject({ name: "Editado em outra aba", revision: 2 });
  expect(kit.database.edges).toEqual([]);
});

test("a agent task cannot be edited", async () => {
  const request = Task.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { useCase } = setup({ tasks: [request] });

  await expect(useCase.execute({ taskId: "request", expectedRevision: 1, name: "Outro" }, actor)).rejects.toThrow(
    "A agent task cannot be edited",
  );
});

test("a wrong revision is a conflict even when only the project changes", async () => {
  const { useCase } = setup({ tasks: [meeting({ projectId: "project-1" })] });

  await expect(useCase.execute({ taskId: "task-1", expectedRevision: 5, projectId: "project-2" }, actor)).rejects.toBeInstanceOf(
    TaskRevisionConflictError,
  );
});

test("swaps the project and null puts the task back in personal", async () => {
  const { useCase, taskRepository } = setup({ tasks: [meeting({ projectId: "project-1" })] });

  await useCase.execute({ taskId: "task-1", expectedRevision: 1, projectId: "project-2" }, actor);
  expect(await taskRepository.findById("task-1")).toMatchObject({ projectId: "project-2", revision: 2 });

  await useCase.execute({ taskId: "task-1", expectedRevision: 2, projectId: null }, actor);
  expect((await taskRepository.findById("task-1"))?.projectId).toBeNull();
});
