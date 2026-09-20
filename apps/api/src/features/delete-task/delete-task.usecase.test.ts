import { expect, test } from "vitest";
import { Task, TaskOwnershipError } from "../../domain";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { DeleteTaskUseCase } from "./delete-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("deletes a task owned by the actor", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new DeleteTaskUseCase(tasks);

  await useCase.execute({ taskId: task.id }, actor);

  expect(await tasks.findById(task.id)).toBeNull();
});

test("rejects deleting another user's task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new DeleteTaskUseCase(tasks);

  await expect(
    useCase.execute({ taskId: task.id }, { userId: "attacker-1" }),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});
