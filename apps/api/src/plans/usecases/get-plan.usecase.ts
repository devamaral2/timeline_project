import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { PlanOwnershipError, type Plan } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";
import type { PlanDetailDto } from "@repo/entities/contracts";

export class GetPlanUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(input: { planId: string }, actor: AuthenticatedUser): Promise<PlanDetailDto | null> {
    const plan = await this.planRepository.findById(input.planId);
    if (!plan) return null;
    if (plan.userId !== actor.userId) {
      throw new PlanOwnershipError();
    }

    return toDetailDto(plan);
  }
}

export function toDetailDto(plan: Plan): PlanDetailDto {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    priority: plan.priority,
    tags: plan.tags,
    startedAt: plan.startedAt?.toISOString(),
    estimatedFinishAt: plan.estimatedFinishAt?.toISOString(),
    finishedAt: plan.finishedAt?.toISOString(),
    dependsOnPlanIds: [...plan.dependsOnPlanIds],
    revision: plan.revision,
  };
}
