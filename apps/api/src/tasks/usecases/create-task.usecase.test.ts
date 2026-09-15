import { expect, test } from "vitest";
import { Plan, PlanNotFoundError, PlanOwnershipError, Task, TaskNotFoundError, TaskOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../../plans/testing/in-memory-plan.repository";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { CreateTaskUseCase } from "./create-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("creates a task without a plan", async () => {
  const tasks = new InMemoryTaskRepository();
  const useCase = new CreateTaskUseCase(tasks, new InMemoryPlanRepository());

  const { taskId } = await useCase.execute({ name: "Comprar tinta" }, actor);

  const task = await tasks.findById(taskId);
  expect(task?.planId).toBeUndefined();
});

test("links a task to a plan owned by the actor", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository();
  const useCase = new CreateTaskUseCase(tasks, new InMemoryPlanRepository([plan]));

  const { taskId } = await useCase.execute({ name: "Comprar tinta", planId: plan.id }, actor);

  const task = await tasks.findById(taskId);
  expect(task?.planId).toBe(plan.id);
});

test("rejects a planId that does not exist", async () => {
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository(), new InMemoryPlanRepository());

  await expect(
    useCase.execute({ name: "Comprar tinta", planId: "missing" }, actor),
  ).rejects.toBeInstanceOf(PlanNotFoundError);
});

test("rejects a planId owned by another user", async () => {
  const plan = Plan.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository(), new InMemoryPlanRepository([plan]));

  await expect(
    useCase.execute({ name: "Comprar tinta", planId: plan.id }, actor),
  ).rejects.toBeInstanceOf(PlanOwnershipError);
});

test("links dependsOnTaskIds when every id exists and is owned by the actor", async () => {
  const prerequisite = Task.create({ userId: "user-1", name: "Preparar parede", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([prerequisite]);
  const useCase = new CreateTaskUseCase(tasks, new InMemoryPlanRepository());

  const { taskId } = await useCase.execute(
    { name: "Pintar", dependsOnTaskIds: [prerequisite.id] },
    actor,
  );

  expect((await tasks.findById(taskId))?.dependsOnTaskIds).toEqual([prerequisite.id]);
});

test("rejects a dependsOnTaskIds entry that does not exist", async () => {
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository(), new InMemoryPlanRepository());

  await expect(
    useCase.execute({ name: "Pintar", dependsOnTaskIds: ["missing"] }, actor),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
});

test("rejects a dependsOnTaskIds entry owned by another user", async () => {
  const theirs = Task.create({ userId: "user-2", name: "Deles", description: "", tags: [] });
  const useCase = new CreateTaskUseCase(new InMemoryTaskRepository([theirs]), new InMemoryPlanRepository());

  await expect(
    useCase.execute({ name: "Pintar", dependsOnTaskIds: [theirs.id] }, actor),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});
