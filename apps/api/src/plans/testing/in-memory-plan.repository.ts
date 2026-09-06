import { PlanNotFoundError, PlanOwnershipError, PlanRevisionConflictError, type Plan } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";

export class InMemoryPlanRepository implements PlanRepository {
  constructor(private plans: Plan[] = []) {}

  async save(plan: Plan): Promise<void> {
    this.plans.push(plan);
  }

  async update(plan: Plan, actorUserId: string, expectedRevision: number): Promise<void> {
    const index = this.plans.findIndex((storedPlan) => storedPlan.id === plan.id);
    if (index === -1) throw new PlanNotFoundError(`Plan not found: ${plan.id}`);

    const existing = this.plans[index];
    if (existing.userId !== actorUserId) throw new PlanOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new PlanRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }

    this.plans[index] = plan;
  }

  async delete(planId: string, actorUserId: string): Promise<void> {
    const plan = this.plans.find((storedPlan) => storedPlan.id === planId);
    if (!plan) throw new PlanNotFoundError(`Plan not found: ${planId}`);
    if (plan.userId !== actorUserId) throw new PlanOwnershipError();
    this.plans = this.plans.filter((storedPlan) => storedPlan.id !== planId);
  }

  async findById(planId: string): Promise<Plan | null> {
    return this.plans.find((plan) => plan.id === planId) ?? null;
  }

  async listByUserId(userId: string): Promise<Plan[]> {
    return this.plans.filter((plan) => plan.userId === userId);
  }
}
