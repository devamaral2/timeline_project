import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { PlanNotFoundError, PlanOwnershipError } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";
import type { UpdatePlanInput } from "@repo/entities/contracts";
import { assertPlansOwned } from "./assert-plans-owned";

export class UpdatePlanUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(input: UpdatePlanInput, actor: AuthenticatedUser): Promise<void> {
    const existingPlan = await this.planRepository.findById(input.planId);
    if (!existingPlan) throw new PlanNotFoundError(`Plan not found: ${input.planId}`);
    if (existingPlan.userId !== actor.userId) throw new PlanOwnershipError();

    if (input.dependsOnPlanIds?.length) {
      await assertPlansOwned(this.planRepository, input.dependsOnPlanIds, actor.userId);
    }

    const revisedPlan = existingPlan.revise({
      name: input.name,
      description: input.description,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      startedAt: input.startedAt !== undefined ? new Date(input.startedAt) : undefined,
      estimatedFinishAt:
        input.estimatedFinishAt !== undefined ? new Date(input.estimatedFinishAt) : undefined,
      finishedAt: input.finishedAt !== undefined ? new Date(input.finishedAt) : undefined,
      dependsOnPlanIds: input.dependsOnPlanIds,
    });

    await this.planRepository.update(revisedPlan, actor.userId, input.expectedRevision);
  }
}
