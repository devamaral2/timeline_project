import type { Task } from "../../domain";
import type { TaskDetailDto } from "@repo/contracts";

export function toTaskDetailDto(task: Task): TaskDetailDto {
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
