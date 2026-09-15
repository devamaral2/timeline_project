import { expect, test } from "vitest";
import { Plan, PlanOwnershipError, Task, TaskOwnershipError, TaskRevisionConflictError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../../plans/testing/in-memory-plan.repository";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { UpdateTaskUseCase } from "./update-task.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

function newTask() {
  return Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
}

test("merges fields and increments the revision", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks, new InMemoryPlanRepository());

  await useCase.execute({ taskId: task.id, expectedRevision: 1, status: "done" }, actor);

  expect(await tasks.findById(task.id)).toMatchObject({ status: "done", revision: 2 });
});

test("rejects an update from a different owner", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks, new InMemoryPlanRepository());

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 1, name: "x" }, { userId: "attacker-1" }),
  ).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("reports a revision conflict for a stale expectedRevision", async () => {
  const task = newTask();
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks, new InMemoryPlanRepository());

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 99, name: "x" }, actor),
  ).rejects.toBeInstanceOf(TaskRevisionConflictError);
});

test("rejects relinking to a plan owned by another user", async () => {
  const task = newTask();
  const plan = Plan.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const tasks = new InMemoryTaskRepository([task]);
  const useCase = new UpdateTaskUseCase(tasks, new InMemoryPlanRepository([plan]));

  await expect(
    useCase.execute({ taskId: task.id, expectedRevision: 1, planId: plan.id }, actor),
  ).rejects.toBeInstanceOf(PlanOwnershipError);
});
