import { expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskOwnershipError } from "../../domain/index";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { DeleteTaskUseCase } from "./delete-task.usecase";

const actor = { userId: "auth-user-1" };

function setup(tasks: Task[]) {
  const database = new InMemoryTaskDatabase(tasks);
  const repository = new InMemoryTaskRepository(database);
  return { database, repository, useCase: new DeleteTaskUseCase(repository) };
}

test("deletes the task of its owner", async () => {
  const task = Task.create({ id: "task-1", userId: actor.userId, name: "Reunião", startedAt: new Date() });
  const { database, useCase } = setup([task]);

  await useCase.execute({ taskId: "task-1" }, actor);

  expect(database.tasks).toEqual([]);
});

test("deleting a main task keeps its subtasks, which lose only the edge to it", async () => {
  const first = Task.create({ id: "first", userId: actor.userId, name: "Reforma", status: "todo" });
  const second = Task.create({ id: "second", userId: actor.userId, name: "Pintar", status: "todo" });
  const { database, repository, useCase } = setup([first, second]);
  database.edges.push({ parentId: "first", subtaskId: "second" });

  await useCase.execute({ taskId: "first" }, actor);

  const remaining = await repository.findById("second");
  expect(remaining?.name).toBe("Pintar");
  expect(remaining?.parentId).toBeUndefined();
  expect(remaining?.revision).toBe(1);
});

test("deleting a subtask leaves its main task without revising it", async () => {
  const first = Task.create({ id: "first", userId: actor.userId, name: "Reforma", status: "todo" });
  const second = Task.create({ id: "second", userId: actor.userId, name: "Pintar", status: "todo" });
  const { database, repository, useCase } = setup([first, second]);
  database.edges.push({ parentId: "first", subtaskId: "second" });

  await useCase.execute({ taskId: "second" }, actor);

  const remaining = await repository.findById("first");
  expect(remaining?.subtaskIds).toEqual([]);
  expect(remaining?.revision).toBe(1);
});

test("deleting a task in the middle of the hierarchy keeps both ends, neither revised", async () => {
  const tasks = ["a", "b", "c"].map((id) => Task.create({ id, userId: actor.userId, name: id, status: "todo" }));
  const { database, repository, useCase } = setup(tasks);
  database.edges.push({ parentId: "a", subtaskId: "b" }, { parentId: "b", subtaskId: "c" });

  await useCase.execute({ taskId: "b" }, actor);

  expect(await repository.findById("a")).toMatchObject({ subtaskIds: [], revision: 1 });
  expect(await repository.findById("c")).toMatchObject({ parentId: undefined, revision: 1 });
});

test("refuses a task that does not exist or belongs to someone else", async () => {
  const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: new Date() });
  const { database, useCase } = setup([theirs]);

  await expect(useCase.execute({ taskId: "missing" }, actor)).rejects.toThrow(TaskNotFoundError);
  await expect(useCase.execute({ taskId: "theirs" }, actor)).rejects.toThrow(TaskOwnershipError);
  expect(database.tasks).toHaveLength(1);
});
