import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { TaskOwnershipError, type Task } from "../../../domain";
import type { TaskRepository } from "../../../domain/ports";
import type { TaskDetailDto } from "@repo/contracts";

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
    parentTaskId: task.parentTaskId,
    name: task.name,
    description: task.description,
    status: task.status,
    priority: task.priority,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: task.tags,
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
    dependsOnTaskIds: [...task.dependsOnTaskIds],
    revision: task.revision,
  };
}
