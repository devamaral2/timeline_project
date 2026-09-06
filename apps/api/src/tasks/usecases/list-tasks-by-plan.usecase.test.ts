import { expect, test } from "vitest";
import { Plan, PlanOwnershipError, Task } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryPlanRepository } from "../../plans/testing/in-memory-plan.repository";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { ListTasksByPlanUseCase } from "./list-tasks-by-plan.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("lists only tasks linked to the given plan", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const linked = Task.create({ userId: "user-1", planId: plan.id, name: "A", description: "", tags: [] });
  const unlinked = Task.create({ userId: "user-1", name: "B", description: "", tags: [] });
  const useCase = new ListTasksByPlanUseCase(
    new InMemoryTaskRepository([linked, unlinked]),
    new InMemoryPlanRepository([plan]),
  );

  const tasks = await useCase.execute({ planId: plan.id }, actor);

  expect(tasks).toHaveLength(1);
  expect(tasks[0].id).toBe(linked.id);
});

test("rejects listing tasks for a plan owned by another user", async () => {
  const plan = Plan.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const useCase = new ListTasksByPlanUseCase(new InMemoryTaskRepository(), new InMemoryPlanRepository([plan]));

  await expect(useCase.execute({ planId: plan.id }, actor)).rejects.toBeInstanceOf(PlanOwnershipError);
});
