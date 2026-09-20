import { expect, test } from "vitest";
import { Task, TaskOwnershipError } from "../../../domain";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { GetTaskUseCase } from "./get-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

test("returns null for a task that does not exist", async () => {
  const useCase = new GetTaskUseCase(new InMemoryTaskRepository());
  expect(await useCase.execute({ taskId: "missing" }, actor)).toBeNull();
});

test("refuses to return another user's task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const useCase = new GetTaskUseCase(new InMemoryTaskRepository([task]));

  await expect(useCase.execute({ taskId: task.id }, attacker)).rejects.toBeInstanceOf(
    TaskOwnershipError,
  );
});
