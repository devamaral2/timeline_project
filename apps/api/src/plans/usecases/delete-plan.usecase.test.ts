import { expect, test } from "vitest";
import { Plan, PlanOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { DeletePlanUseCase } from "./delete-plan.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("deletes a plan owned by the actor", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const repository = new InMemoryPlanRepository([plan]);
  const useCase = new DeletePlanUseCase(repository);

  await useCase.execute({ planId: plan.id }, actor);

  expect(await repository.findById(plan.id)).toBeNull();
});

test("rejects deleting another user's plan", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const repository = new InMemoryPlanRepository([plan]);
  const useCase = new DeletePlanUseCase(repository);

  await expect(
    useCase.execute({ planId: plan.id }, { userId: "attacker-1" }),
  ).rejects.toBeInstanceOf(PlanOwnershipError);
});
