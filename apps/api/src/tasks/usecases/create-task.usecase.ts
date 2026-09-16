import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { Task } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";
import type { CreateTaskInput } from "@repo/entities/contracts";
import { assertTasksOwned } from "./assert-tasks-owned";
import { assertParentTaskAssignable } from "./assert-parent-task";

export class CreateTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: CreateTaskInput, actor: AuthenticatedUser): Promise<{ taskId: string }> {
    if (input.parentTaskId) {
      await assertParentTaskAssignable(this.taskRepository, input.parentTaskId, actor.userId);
    }
    if (input.dependsOnTaskIds?.length) {
      await assertTasksOwned(this.taskRepository, input.dependsOnTaskIds, actor.userId);
    }

    const task = Task.create({
      userId: actor.userId,
      parentTaskId: input.parentTaskId,
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
