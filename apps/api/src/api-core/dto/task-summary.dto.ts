import type { TaskSummaryDto } from "@repo/contracts";

export function toTaskSummaryDto(task: {
  id: string;
  parentTaskId?: string;
  name: string;
  status: TaskSummaryDto["status"];
  priority: TaskSummaryDto["priority"];
  notifyOffsetsMinutes: readonly TaskSummaryDto["notifyOffsetsMinutes"][number][];
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}): TaskSummaryDto {
  return {
    id: task.id,
    parentTaskId: task.parentTaskId,
    name: task.name,
    status: task.status,
    priority: task.priority,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: task.tags,
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
  };
}
