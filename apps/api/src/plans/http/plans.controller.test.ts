import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import { Plan, PlanOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { InMemoryPlanRepository } from "../testing/in-memory-plan.repository";
import { InMemoryTaskRepository } from "../../tasks/testing/in-memory-task.repository";
import { CreatePlanUseCase } from "../usecases/create-plan.usecase";
import { GetPlanUseCase } from "../usecases/get-plan.usecase";
import { UpdatePlanUseCase } from "../usecases/update-plan.usecase";
import { DeletePlanUseCase } from "../usecases/delete-plan.usecase";
import { ListPlansUseCase } from "../usecases/list-plans.usecase";
import { ListTasksByPlanUseCase } from "../../tasks/usecases/list-tasks-by-plan.usecase";
import { PlansController } from "./plans.controller";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

function makeController(plans: Plan[] = []) {
  const planRepository = new InMemoryPlanRepository(plans);
  const taskRepository = new InMemoryTaskRepository();

  const controller = new PlansController(
    new ListPlansUseCase(planRepository),
    new CreatePlanUseCase(planRepository),
    new GetPlanUseCase(planRepository),
    new UpdatePlanUseCase(planRepository),
    new DeletePlanUseCase(planRepository),
    new ListTasksByPlanUseCase(taskRepository, planRepository),
  );

  return { controller, planRepository };
}

test("POST /api/plans rejects an invalid status", async () => {
  const { controller } = makeController();

  await expect(
    controller.create({ name: "Reforma", status: "invalid" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("POST /api/plans creates a plan for the authenticated actor", async () => {
  const { controller, planRepository } = makeController();

  const { planId } = await controller.create({ name: "Reforma" }, actor);

  expect((await planRepository.findById(planId))?.userId).toBe("user-1");
});

test("GET /api/plans/:planId answers 404 for a plan that does not exist", async () => {
  const { controller } = makeController();

  await expect(controller.detail("missing", actor)).rejects.toThrow("Plan not found");
});

test("GET /api/plans/:planId refuses to return another user's plan", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const { controller } = makeController([plan]);

  await expect(controller.detail(plan.id, attacker)).rejects.toBeInstanceOf(PlanOwnershipError);
});

test("PATCH /api/plans/:planId rejects a request without expectedRevision", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const { controller } = makeController([plan]);

  await expect(
    controller.update(plan.id, { name: "Novo nome" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("POST /api/plans rejects a non-array dependsOnPlanIds", async () => {
  const { controller } = makeController();

  await expect(
    controller.create({ name: "Reforma", dependsOnPlanIds: "not-an-array" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("PATCH /api/plans/:planId surfaces the domain rejection of self-dependency", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const { controller } = makeController([plan]);

  await expect(
    controller.update(plan.id, { expectedRevision: 1, dependsOnPlanIds: [plan.id] } as never, actor),
  ).rejects.toThrow("Plan cannot depend on itself");
});

test("DELETE /api/plans/:planId removes the plan", async () => {
  const plan = Plan.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const { controller, planRepository } = makeController([plan]);

  await controller.remove(plan.id, actor);

  expect(await planRepository.findById(plan.id)).toBeNull();
});
