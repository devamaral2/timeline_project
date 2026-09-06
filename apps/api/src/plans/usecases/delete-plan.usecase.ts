import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { PlanRepository } from "@repo/entities/ports";

export class DeletePlanUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(input: { planId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.planRepository.delete(input.planId, actor.userId);
  }
}
