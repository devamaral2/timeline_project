import { expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskOwnershipError, TaskValidationError } from "../../../domain/index";
import { InMemoryTaskDatabase } from "../testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { planSequence } from "./task-sequence";

const userId = "auth-user-1";
const none = { previousIds: [], nextIds: [] };

function taskOf(id: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId, name: id, status: "todo", ...overrides });
}

function repositoryOf(...tasks: Task[]) {
  return new InMemoryTaskRepository(new InMemoryTaskDatabase(tasks));
}

test("plans nothing when no list was sent", async () => {
  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: ["n1"] }, {}, repositoryOf(), userId);

  expect(plan).toEqual([]);
});

test("plans nothing when the lists already match, without reading any task", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  const plan = await planSequence(
    "target",
    { previousIds: ["p1", "p2"], nextIds: ["n1"] },
    { previousIds: ["p2", "p1"], nextIds: ["n1"] },
    neverRead,
    userId,
  );

  expect(plan).toEqual([]);
});

test("adds an edge from each new predecessor to the task", async () => {
  const tasks = repositoryOf(taskOf("p1"), taskOf("p2"));

  const plan = await planSequence("target", none, { previousIds: ["p1", "p2"] }, tasks, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "p1", toId: "target" },
    { op: "add", fromId: "p2", toId: "target" },
  ]);
});

test("adds an edge from the task to each new successor", async () => {
  const tasks = repositoryOf(taskOf("n1"), taskOf("n2"));

  const plan = await planSequence("target", none, { nextIds: ["n1", "n2"] }, tasks, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "target", toId: "n1" },
    { op: "add", fromId: "target", toId: "n2" },
  ]);
});

test("removes the edges of the predecessors and successors that left the lists", async () => {
  const plan = await planSequence(
    "target",
    { previousIds: ["p1", "p2"], nextIds: ["n1", "n2"] },
    { previousIds: ["p2"], nextIds: [] },
    repositoryOf(),
    userId,
  );

  expect(plan).toEqual([
    { op: "remove", fromId: "p1", toId: "target" },
    { op: "remove", fromId: "target", toId: "n1" },
    { op: "remove", fromId: "target", toId: "n2" },
  ]);
});

test("replacing a predecessor removes the old edge and adds the new one", async () => {
  const tasks = repositoryOf(taskOf("p2"));

  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: [] }, { previousIds: ["p2"] }, tasks, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "p2", toId: "target" },
    { op: "remove", fromId: "p1", toId: "target" },
  ]);
});

test("an absent side is left alone while the other one changes", async () => {
  const tasks = repositoryOf(taskOf("p2"));

  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: ["n1"] }, { previousIds: ["p1", "p2"] }, tasks, userId);

  expect(plan).toEqual([{ op: "add", fromId: "p2", toId: "target" }]);
});

test("a repeated id in a desired list plans a single edge", async () => {
  const tasks = repositoryOf(taskOf("p1"));

  const plan = await planSequence("target", none, { previousIds: ["p1", "p1"] }, tasks, userId);

  expect(plan).toEqual([{ op: "add", fromId: "p1", toId: "target" }]);
});

test("the same task can be predecessor and successor, each as its own edge", async () => {
  const tasks = repositoryOf(taskOf("o1"));

  const plan = await planSequence("target", none, { previousIds: ["o1"], nextIds: ["o1"] }, tasks, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "o1", toId: "target" },
    { op: "add", fromId: "target", toId: "o1" },
  ]);
});

test("plans without revising or writing any task", async () => {
  const database = new InMemoryTaskDatabase([taskOf("p1"), taskOf("n1")]);

  const plan = await planSequence("target", none, { previousIds: ["p1"], nextIds: ["n1"] }, new InMemoryTaskRepository(database), userId);

  expect(plan).toHaveLength(2);
  expect(plan.every((change) => !("task" in change) && !("expectedRevision" in change))).toBe(true);
  expect(database.tasks.map((task) => [task.id, task.revision])).toEqual([
    ["p1", 1],
    ["n1", 1],
  ]);
  expect(database.edges).toEqual([]);
});

test("a agent task can be on either end of the sequence", async () => {
  const request = Task.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const tasks = repositoryOf(request);

  const plan = await planSequence("target", none, { previousIds: ["request"] }, tasks, userId);
  const reverse = await planSequence("target", none, { nextIds: ["request"] }, tasks, userId);

  expect(plan).toEqual([{ op: "add", fromId: "request", toId: "target" }]);
  expect(reverse).toEqual([{ op: "add", fromId: "target", toId: "request" }]);
});

test("refuses a task that follows itself", async () => {
  const tasks = repositoryOf();

  await expect(planSequence("target", none, { previousIds: ["target"] }, tasks, userId)).rejects.toThrow(
    "A task cannot follow itself",
  );
  await expect(planSequence("target", none, { nextIds: ["target"] }, tasks, userId)).rejects.toThrow(TaskValidationError);
});

test("every new end must exist and belong to the user", async () => {
  const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
  const tasks = repositoryOf(theirs, taskOf("p1"));

  await expect(planSequence("target", none, { previousIds: ["p1", "missing"] }, tasks, userId)).rejects.toThrow(
    TaskNotFoundError,
  );
  await expect(planSequence("target", none, { nextIds: ["missing"] }, tasks, userId)).rejects.toThrow(TaskNotFoundError);
  await expect(planSequence("target", none, { previousIds: ["theirs"] }, tasks, userId)).rejects.toThrow(
    TaskOwnershipError,
  );
  await expect(planSequence("target", none, { nextIds: ["theirs"] }, tasks, userId)).rejects.toThrow(TaskOwnershipError);
});

test("removing an edge to an end that no longer exists is allowed", async () => {
  const plan = await planSequence("target", { previousIds: ["gone"], nextIds: ["vanished"] }, { previousIds: [], nextIds: [] }, repositoryOf(), userId);

  expect(plan).toEqual([
    { op: "remove", fromId: "gone", toId: "target" },
    { op: "remove", fromId: "target", toId: "vanished" },
  ]);
});
