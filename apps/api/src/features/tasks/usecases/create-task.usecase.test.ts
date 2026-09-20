import { expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskOwnershipError } from "../../../domain";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { CreateTaskUseCase } from "./create-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("creates a top-level task", async () => {
  const tasks = new InMemoryTaskRepository();
  const useCase = new CreateTaskUseCase(tasks);

  const { taskId } = await useCase.execute({ name: "Comprar tinta" }, actor);

  const task = await tasks.findById(taskId);
  expect(task?.parentTaskId).toBeUndefined();
});

test("creates a subtask of a task owned by the actor", async () => {
  const parent = Task.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([parent]);
  const useCase = new CreateTaskUseCase(tasks);

  const { taskId } = await useCase.execute(
    { name: "Comprar tinta", parentTaskId: parent.id },
    actor,
  );

  const task = await tasks.findById(taskId);
  expect(task?.parentTaskId).toBe(parent.id);
});

test("rejects a parentTaskId that does not exist", async () => {
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository());

  await expect(
    useCase.execute({ name: "Comprar tinta", parentTaskId: "missing" }, actor),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
});

test("rejects a parentTaskId owned by another user", async () => {
  const theirs = Task.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository([theirs]));

  await expect(
    useCase.execute({ name: "Comprar tinta", parentTaskId: theirs.id }, actor),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("links dependsOnTaskIds when every id exists and is owned by the actor", async () => {
  const prerequisite = Task.create({ userId: "user-1", name: "Preparar parede", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([prerequisite]);
  const useCase = new CreateTaskUseCase(tasks);

  const { taskId } = await useCase.execute(
    { name: "Pintar", dependsOnTaskIds: [prerequisite.id] },
    actor,
  );

  expect((await tasks.findById(taskId))?.dependsOnTaskIds).toEqual([prerequisite.id]);
});

test("rejects a dependsOnTaskIds entry that does not exist", async () => {
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository());

  await expect(
    useCase.execute({ name: "Pintar", dependsOnTaskIds: ["missing"] }, actor),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
});

test("rejects a dependsOnTaskIds entry owned by another user", async () => {
  const theirs = Task.create({ userId: "user-2", name: "Deles", description: "", tags: [] });
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository([theirs]));

  await expect(
    useCase.execute({ name: "Pintar", dependsOnTaskIds: [theirs.id] }, actor),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});
