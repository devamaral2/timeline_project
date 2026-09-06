import { expect, test } from "vitest";
import { Plan, PlanNotFoundError, PlanOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
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
