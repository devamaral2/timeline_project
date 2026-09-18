import { TaskNotFoundError, TaskOwnershipError } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";

export async function assertTasksOwned(
  taskRepository: Pick<TaskRepository, "findById">,
  taskIds: readonly string[],
  actorUserId: string,
): Promise<void> {
  for (const taskId of taskIds) {
    const task = await taskRepository.findById(taskId);
    if (!task) throw new TaskNotFoundError(`Task not found: ${taskId}`);
    if (task.userId !== actorUserId) throw new TaskOwnershipError();
  }
}
