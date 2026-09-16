import { expect, test } from "vitest";
import {
  Task,
  TaskHierarchyError,
  TaskOwnershipError,
  TaskRevisionConflictError,
} from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { UpdateTaskUseCase } from "./update-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

function newTask() {
  return Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
}

test("merges fields and increments the revision", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks);

  await useCase.execute({ taskId: task.id, expectedRevision: 1, status: "done" }, actor);

  expect(await tasks.findById(task.id)).toMatchObject({ status: "done", revision: 2 });
});

test("rejects an update from a different owner", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks);

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 1, name: "x" }, { userId: "attacker-1" }),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("reports a revision conflict for a stale expectedRevision", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks);

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 99, name: "x" }, actor),
  ).rejects.toBeInstanceOf(TaskRevisionConflictError);
});

test("rejects reparenting under a task owned by another user", async () => {
  const task = newTask();
  const theirs = Task.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([task, theirs]);
  const useCase = new UpdateTaskUseCase(tasks);

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 1, parentTaskId: theirs.id }, actor),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("rejects reparenting a task under its own subtask", async () => {
  const parent = newTask();
  const child = Task.create({
    userId: "user-1",
    parentTaskId: parent.id,
    name: "Filha",
    description: "",
    tags: [],
  });
  const grandchild = Task.create({
    userId: "user-1",
    parentTaskId: child.id,
    name: "Neta",
    description: "",
    tags: [],
  });
  const tasks = new InMemoryTaskRepository([parent, child, grandchild]);
  const useCase = new UpdateTaskUseCase(tasks);

  await expect(
    useCase.execute({ taskId: parent.id, expectedRevision: 1, parentTaskId: grandchild.id }, actor),
  ).rejects.toBeInstanceOf(TaskHierarchyError);
});

test("accepts reparenting under an unrelated task", async () => {
  const task = newTask();
  const other = Task.create({ userId: "user-1", name: "Outra", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([task, other]);
  const useCase = new UpdateTaskUseCase(tasks);

  await useCase.execute({ taskId: task.id, expectedRevision: 1, parentTaskId: other.id }, actor);

  expect((await tasks.findById(task.id))?.parentTaskId).toBe(other.id);
});
