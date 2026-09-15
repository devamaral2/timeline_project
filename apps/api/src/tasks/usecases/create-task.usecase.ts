import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { PlanNotFoundError, PlanOwnershipError, Task } from "@repo/entities";
import type { PlanRepository, TaskRepository } from "@repo/entities/ports";
import type { CreateTaskInput } from "@repo/entities/contracts";
import { assertTasksOwned } from "./assert-tasks-owned";

export class CreateTaskUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly planRepository: PlanRepository,
  ) {}

  async execute(input: CreateTaskInput, actor: AuthenticatedUser): Promise<{ taskId: string }> {
    if (input.planId) {
      const plan = await this.planRepository.findById(input.planId);
      if (!plan) throw new PlanNotFoundError(`Plan not found: ${input.planId}`);
      if (plan.userId !== actor.userId) throw new PlanOwnershipError();
    }
    if (input.dependsOnTaskIds?.length) {
      await assertTasksOwned(this.taskRepository, input.dependsOnTaskIds, actor.userId);
    }

    const task = Task.create({
      userId: actor.userId,
      planId: input.planId,
      name: input.name ?? "",
      description: input.description ?? "",
      status: input.status,
      priority: input.priority,
      tags: input.tags ?? [],
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      estimatedFinishAt: input.estimatedFinishAt ? new Date(input.estimatedFinishAt) : undefined,
      finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
      dependsOnTaskIds: input.dependsOnTaskIds,
    });

    await this.taskRepository.save(task);
    return { taskId: task.id };
  }
}
