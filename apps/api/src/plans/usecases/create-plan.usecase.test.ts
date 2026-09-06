import { expect, test } from "vitest";
import { Plan, PlanNotFoundError, PlanOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { CreatePlanUseCase } from "./create-plan.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("creates a plan with default status/priority when omitted", async () => {
  const repository = new InMemoryPlanRepository();
  const useCase = new CreatePlanUseCase(repository);

  const { planId } = await useCase.execute({ name: "Reforma da casa" }, actor);

  const plan = await repository.findById(planId);
  expect(plan?.userId).toBe("user-1");
  expect(plan?.status).toBe("todo");
  expect(plan?.priority).toBe("medium");
});

test("creates a plan with the given fields", async () => {
  const repository = new InMemoryPlanRepository();
  const useCase = new CreatePlanUseCase(repository);

  const { planId } = await useCase.execute(
    { name: "Reforma", status: "inProgress", priority: "high", tags: ["casa"] },
    actor,
  );

  const plan = await repository.findById(planId);
  expect(plan).toMatchObject({ name: "Reforma", status: "inProgress", priority: "high", tags: ["casa"] });
});

test("links dependsOnPlanIds when every id exists and is owned by the actor", async () => {
  const prerequisite = Plan.create({ userId: "user-1", name: "Fundação", description: "", tags: [] });
  const repository = new InMemoryPlanRepository([prerequisite]);
  const useCase = new CreatePlanUseCase(repository);

  const { planId } = await useCase.execute(
    { name: "Reforma", dependsOnPlanIds: [prerequisite.id] },
    actor,
  );

  expect((await repository.findById(planId))?.dependsOnPlanIds).toEqual([prerequisite.id]);
});

test("rejects a dependsOnPlanIds entry that does not exist", async () => {
  const useCase = new CreatePlanUseCase(new InMemoryPlanRepository());

  await expect(
    useCase.execute({ name: "Reforma", dependsOnPlanIds: ["missing"] }, actor),
  ).rejects.toBeInstanceOf(PlanNotFoundError);
});

test("rejects a dependsOnPlanIds entry owned by another user", async () => {
  const theirs = Plan.create({ userId: "user-2", name: "Deles", description: "", tags: [] });
  const useCase = new CreatePlanUseCase(new InMemoryPlanRepository([theirs]));

  await expect(
    useCase.execute({ name: "Reforma", dependsOnPlanIds: [theirs.id] }, actor),
  ).rejects.toBeInstanceOf(PlanOwnershipError);
});
