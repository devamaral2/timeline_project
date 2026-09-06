import { expect, test } from "vitest";
import { Plan, PlanOwnershipError, PlanRevisionConflictError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { UpdatePlanUseCase } from "./update-plan.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

function newPlan() {
  return Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
}

test("merges only the provided fields and increments the revision", async () => {
  const plan = newPlan();
  const repository = new InMemoryPlanRepository([plan]);
  const useCase = new UpdatePlanUseCase(repository);

  await useCase.execute({ planId: plan.id, expectedRevision: 1, status: "done" }, actor);

  const updated = await repository.findById(plan.id);
  expect(updated).toMatchObject({ name: "Reforma", status: "done", revision: 2 });
});

test("rejects an update from a different owner", async () => {
  const plan = newPlan();
  const repository = new InMemoryPlanRepository([plan]);
  const useCase = new UpdatePlanUseCase(repository);

  await expect(
    useCase.execute({ planId: plan.id, expectedRevision: 1, name: "x" }, attacker),
  ).rejects.toBeInstanceOf(PlanOwnershipError);
});

test("reports a revision conflict for a stale expectedRevision", async () => {
  const plan = newPlan();
  const repository = new InMemoryPlanRepository([plan]);
  const useCase = new UpdatePlanUseCase(repository);

  await expect(
    useCase.execute({ planId: plan.id, expectedRevision: 99, name: "x" }, actor),
  ).rejects.toBeInstanceOf(PlanRevisionConflictError);
});
