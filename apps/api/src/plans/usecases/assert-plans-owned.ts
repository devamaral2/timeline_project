import { PlanNotFoundError, PlanOwnershipError } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";

export async function assertPlansOwned(
  planRepository: PlanRepository,
  planIds: readonly string[],
  actorUserId: string,
): Promise<void> {
  for (const planId of planIds) {
    const plan = await planRepository.findById(planId);
    if (!plan) throw new PlanNotFoundError(`Plan not found: ${planId}`);
    if (plan.userId !== actorUserId) throw new PlanOwnershipError();
  }
}
