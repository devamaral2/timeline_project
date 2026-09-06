import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { PlanNotFoundError, PlanOwnershipError } from "@repo/entities";
import type { PlanRepository, TaskRepository } from "@repo/entities/ports";
import type { TaskSummaryDto } from "@repo/entities/contracts";
import { toSummaryDto } from "./list-tasks.usecase";

export class ListTasksByPlanUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly planRepository: PlanRepository,
  ) {}

  async execute(input: { planId: string }, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    const plan = await this.planRepository.findById(input.planId);
    if (!plan) throw new PlanNotFoundError(`Plan not found: ${input.planId}`);
    if (plan.userId !== actor.userId) throw new PlanOwnershipError();

    const tasks = await this.taskRepository.listByPlanId(input.planId);
    return tasks.map(toSummaryDto);
  }
}
