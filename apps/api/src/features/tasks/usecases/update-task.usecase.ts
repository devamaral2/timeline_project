import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { TaskNotFoundError, TaskOwnershipError } from "../../../domain";
import type { TaskRepository } from "../../../domain/ports";
import type { UpdateTaskInput } from "@repo/contracts";
import { assertTasksOwned } from "./assert-tasks-owned";
import { assertParentTaskAssignable } from "./assert-parent-task";

export class UpdateTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: UpdateTaskInput, actor: AuthenticatedUser): Promise<void> {
    const existingTask = await this.taskRepository.findById(input.taskId);
    if (!existingTask) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    if (existingTask.userId !== actor.userId) throw new TaskOwnershipError();

    if (input.parentTaskId) {
      await assertParentTaskAssignable(
        this.taskRepository,
        input.parentTaskId,
        actor.userId,
        input.taskId,
      );
    }
    if (input.dependsOnTaskIds?.length) {
      await assertTasksOwned(this.taskRepository, input.dependsOnTaskIds, actor.userId);
    }

    const revisedTask = existingTask.revise({
      parentTaskId: input.parentTaskId,
      name: input.name,
      description: input.description,
      status: input.status,
      priority: input.priority,
      notifyOffsetsMinutes: input.notifyOffsetsMinutes,
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
