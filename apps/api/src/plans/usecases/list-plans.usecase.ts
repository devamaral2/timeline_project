import type { AuthenticatedUser } from "../../auth/authenticated-user";
import type { PlanRepository } from "@repo/entities/ports";
import type { PlanSummaryDto } from "@repo/entities/contracts";

export class ListPlansUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<PlanSummaryDto[]> {
    const plans = await this.planRepository.listByUserId(actor.userId);
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      status: plan.status,
      priority: plan.priority,
      tags: plan.tags,
      startedAt: plan.startedAt?.toISOString(),
      estimatedFinishAt: plan.estimatedFinishAt?.toISOString(),
      finishedAt: plan.finishedAt?.toISOString(),
    }));
  }
}
