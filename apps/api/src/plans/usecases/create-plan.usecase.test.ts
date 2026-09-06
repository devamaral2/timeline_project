import { expect, test } from "vitest";
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
