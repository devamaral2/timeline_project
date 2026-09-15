import { expect, test } from "vitest";
import { Plan, PlanOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { GetPlanUseCase } from "./get-plan.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

test("returns null for a plan that does not exist", async () => {
  const useCase = new GetPlanUseCase(new InMemoryPlanRepository());
  expect(await useCase.execute({ planId: "missing" }, actor)).toBeNull();
});

test("refuses to return another user's plan", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const useCase = new GetPlanUseCase(new InMemoryPlanRepository([plan]));

  await expect(useCase.execute({ planId: plan.id }, attacker)).rejects.toBeInstanceOf(
    PlanOwnershipError,
  );
});

test("returns the detail dto for the owner", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: ["casa"] });
  const useCase = new GetPlanUseCase(new InMemoryPlanRepository([plan]));

  const detail = await useCase.execute({ planId: plan.id }, actor);
  expect(detail).toMatchObject({ id: plan.id, name: "Reforma", tags: ["casa"], revision: 1 });
});
