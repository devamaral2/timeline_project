import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { PlanNotFoundError, PlanOwnershipError, TaskNotFoundError, TaskOwnershipError } from "@repo/entities";
import type { PlanRepository, TaskRepository } from "@repo/entities/ports";
import type { UpdateTaskInput } from "@repo/entities/contracts";
import { assertTasksOwned } from "./assert-tasks-owned";

export class UpdateTaskUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly planRepository: PlanRepository,
  ) {}

  async execute(input: UpdateTaskInput, actor: AuthenticatedUser): Promise<void> {
    const existingTask = await this.taskRepository.findById(input.taskId);
    if (!existingTask) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    if (existingTask.userId !== actor.userId) throw new TaskOwnershipError();

    if (input.planId) {
      const plan = await this.planRepository.findById(input.planId);
      if (!plan) throw new PlanNotFoundError(`Plan not found: ${input.planId}`);
      if (plan.userId !== actor.userId) throw new PlanOwnershipError();
    }
    if (input.dependsOnTaskIds?.length) {
      await assertTasksOwned(this.taskRepository, input.dependsOnTaskIds, actor.userId);
    }

    const revisedTask = existingTask.revise({
      planId: input.planId,
      name: input.name,
      description: input.description,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      startedAt: input.startedAt !== undefined ? new Date(input.startedAt) : undefined,
      estimatedFinishAt:
        input.estimatedFinishAt !== undefined ? new Date(input.estimatedFinishAt) : undefined,
      finishedAt: input.finishedAt !== undefined ? new Date(input.finishedAt) : undefined,
      dependsOnTaskIds: input.dependsOnTaskIds,
    });

    await this.taskRepository.update(revisedTask, actor.userId, input.expectedRevision);
  }
}
