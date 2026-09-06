import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { Plan } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";
import type { CreatePlanInput } from "@repo/entities/contracts";

export class CreatePlanUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  async execute(input: CreatePlanInput, actor: AuthenticatedUser): Promise<{ planId: string }> {
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
    });

    await this.planRepository.save(plan);
    return { planId: plan.id };
  }
}
