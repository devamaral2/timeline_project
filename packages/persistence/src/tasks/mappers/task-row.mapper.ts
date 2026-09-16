import { Task, type WorkItemPriority, type WorkItemStatus } from "@repo/entities";
import { occurrenceLinkOf, type OccurrenceColumns } from "../../recurrences/mappers/occurrence-columns";

export interface TaskRow extends Partial<OccurrenceColumns> {
  id: string;
  revision: number;
  userId: string;
  parentTaskId: string | null;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  startedAt: Date | null;
  estimatedFinishAt: Date | null;
  finishedAt: Date | null;
}

export function mapTaskRow(
  row: TaskRow,
  tagNames: readonly string[],
  dependsOnTaskIds: readonly string[] = [],
): Task {
  return Task.rehydrate({
    id: row.id,
    userId: row.userId,
    parentTaskId: row.parentTaskId ?? undefined,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    tags: [...tagNames],
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    dependsOnTaskIds: [...dependsOnTaskIds],
    occurrence: occurrenceLinkOf(row),
    revision: row.revision,
  });
}
