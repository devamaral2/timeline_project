import { expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskOwnershipError, TaskValidationError } from "../../../domain/index";
import { InMemoryTaskDatabase } from "../testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { planSubtasks } from "./task-hierarchy";

const userId = "auth-user-1";
const none = { parentId: undefined, subtaskIds: [] };

function taskOf(id: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId, name: id, status: "todo", ...overrides });
}

function repositoryOf(...tasks: Task[]) {
  return new InMemoryTaskRepository(new InMemoryTaskDatabase(tasks));
}

test("plans nothing when neither side was sent", async () => {
  const plan = await planSubtasks("target", { parentId: "p1", subtaskIds: ["s1"] }, {}, repositoryOf(), userId);

  expect(plan).toEqual([]);
});

test("plans nothing when the hierarchy already matches, without reading any task", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  const plan = await planSubtasks(
    "target",
    { parentId: "p1", subtaskIds: ["s1", "s2"] },
    { parentId: "p1", subtaskIds: ["s2", "s1"] },
    neverRead,
    userId,
  );

  expect(plan).toEqual([]);
});

test("a new main task adds the edge from it to the task", async () => {
  const plan = await planSubtasks("target", none, { parentId: "p1" }, repositoryOf(taskOf("p1")), userId);

  expect(plan).toEqual([{ op: "add", parentId: "p1", subtaskId: "target" }]);
});

test("replacing the main task removes the old edge and adds the new one", async () => {
  const plan = await planSubtasks("target", { parentId: "p1", subtaskIds: [] }, { parentId: "p2" }, repositoryOf(taskOf("p2")), userId);

  expect(plan).toEqual([
    { op: "remove", parentId: "p1", subtaskId: "target" },
    { op: "add", parentId: "p2", subtaskId: "target" },
  ]);
});

test("null takes the task out from under its main task", async () => {
  const plan = await planSubtasks("target", { parentId: "p1", subtaskIds: [] }, { parentId: null }, repositoryOf(), userId);

  expect(plan).toEqual([{ op: "remove", parentId: "p1", subtaskId: "target" }]);
});

test("adds an edge from the task to each new subtask and removes the ones that left", async () => {
  const tasks = repositoryOf(taskOf("s2"), taskOf("s3"));

  const plan = await planSubtasks("target", { parentId: undefined, subtaskIds: ["s1"] }, { subtaskIds: ["s2", "s3"] }, tasks, userId);

  expect(plan).toEqual([
    { op: "add", parentId: "target", subtaskId: "s2" },
    { op: "add", parentId: "target", subtaskId: "s3" },
    { op: "remove", parentId: "target", subtaskId: "s1" },
  ]);
});

test("an absent side is left alone while the other one changes", async () => {
  const plan = await planSubtasks("target", { parentId: "p1", subtaskIds: ["s1"] }, { subtaskIds: ["s1", "s2"] }, repositoryOf(taskOf("s2")), userId);

  expect(plan).toEqual([{ op: "add", parentId: "target", subtaskId: "s2" }]);
});

test("a repeated id in the subtask list plans a single edge", async () => {
  const plan = await planSubtasks("target", none, { subtaskIds: ["s1", "s1"] }, repositoryOf(taskOf("s1")), userId);

  expect(plan).toEqual([{ op: "add", parentId: "target", subtaskId: "s1" }]);
});

test("plans without revising or writing any task", async () => {
  const database = new InMemoryTaskDatabase([taskOf("p1"), taskOf("s1")]);

  const plan = await planSubtasks("target", none, { parentId: "p1", subtaskIds: ["s1"] }, new InMemoryTaskRepository(database), userId);

  expect(plan).toHaveLength(2);
  expect(database.tasks.map((task) => [task.id, task.revision])).toEqual([
    ["p1", 1],
    ["s1", 1],
  ]);
  expect(database.edges).toEqual([]);
});

test("a agent task can be on either end of the hierarchy", async () => {
  const request = Task.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const tasks = repositoryOf(request);

  const asParent = await planSubtasks("target", none, { parentId: "request" }, tasks, userId);
  const asSubtask = await planSubtasks("target", none, { subtaskIds: ["request"] }, tasks, userId);

  expect(asParent).toEqual([{ op: "add", parentId: "request", subtaskId: "target" }]);
  expect(asSubtask).toEqual([{ op: "add", parentId: "target", subtaskId: "request" }]);
});

test("refuses a task that is its own main task or subtask", async () => {
  const tasks = repositoryOf();

  await expect(planSubtasks("target", none, { parentId: "target" }, tasks, userId)).rejects.toThrow(
    "A task cannot be its own subtask",
  );
  await expect(planSubtasks("target", none, { subtaskIds: ["target"] }, tasks, userId)).rejects.toThrow(TaskValidationError);
});

test("every new end must exist and belong to the user", async () => {
  const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
  const tasks = repositoryOf(theirs, taskOf("s1"));

  await expect(planSubtasks("target", none, { subtaskIds: ["s1", "missing"] }, tasks, userId)).rejects.toThrow(TaskNotFoundError);
  await expect(planSubtasks("target", none, { parentId: "missing" }, tasks, userId)).rejects.toThrow(TaskNotFoundError);
  await expect(planSubtasks("target", none, { parentId: "theirs" }, tasks, userId)).rejects.toThrow(TaskOwnershipError);
  await expect(planSubtasks("target", none, { subtaskIds: ["theirs"] }, tasks, userId)).rejects.toThrow(TaskOwnershipError);
});

test("removing an edge to an end that no longer exists is allowed", async () => {
  const plan = await planSubtasks("target", { parentId: "gone", subtaskIds: ["vanished"] }, { parentId: null, subtaskIds: [] }, repositoryOf(), userId);

  expect(plan).toEqual([
    { op: "remove", parentId: "gone", subtaskId: "target" },
    { op: "remove", parentId: "target", subtaskId: "vanished" },
  ]);
});
