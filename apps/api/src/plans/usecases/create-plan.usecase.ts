import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { Plan } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";
import type { CreatePlanInput } from "@repo/entities/contracts";
import { assertPlansOwned } from "./assert-plans-owned";

export class CreatePlanUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(input: CreatePlanInput, actor: AuthenticatedUser): Promise<{ planId: string }> {
    if (input.dependsOnPlanIds?.length) {
      await assertPlansOwned(this.planRepository, input.dependsOnPlanIds, actor.userId);
    }

    const plan = Plan.create({
      userId: actor.userId,
      name: input.name ?? "",
      description: input.description ?? "",
      status: input.status,
      priority: input.priority,
      tags: input.tags ?? [],
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      estimatedFinishAt: input.estimatedFinishAt ? new Date(input.estimatedFinishAt) : undefined,
      finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
      dependsOnPlanIds: input.dependsOnPlanIds,
    });

    await this.planRepository.save(plan);
    return { planId: plan.id };
  }
}
