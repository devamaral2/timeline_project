import { expect, test } from "vitest";
import { Plan } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { ListPlansUseCase } from "./list-plans.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("lists only plans owned by the actor", async () => {
  const mine = Plan.create({ userId: "user-1", name: "Meu", description: "", tags: [] });
  const theirs = Plan.create({ userId: "user-2", name: "Deles", description: "", tags: [] });
  const useCase = new ListPlansUseCase(new InMemoryPlanRepository([mine, theirs]));

  const plans = await useCase.execute(undefined, actor);

  expect(plans).toHaveLength(1);
  expect(plans[0].id).toBe(mine.id);
});
