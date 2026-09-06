import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { TaskOwnershipError, type Task } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";
import type { TaskDetailDto } from "@repo/entities/contracts";

export class GetTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<TaskDetailDto | null> {
    const task = await this.taskRepository.findById(input.taskId);
    if (!task) return null;
    if (task.userId !== actor.userId) {
      throw new TaskOwnershipError();
    }

    return toDetailDto(task);
  }
}

export function toDetailDto(task: Task): TaskDetailDto {
  return {
    id: task.id,
    planId: task.planId,
    name: task.name,
    description: task.description,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
    revision: task.revision,
  };
}
