import {
  Task,
  type WorkItemPriority,
  type WorkItemStatus,
  type NotificationOffsetMinutes,
} from "../../../../domain";
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
  /** `number[]` e nao a uniao: quem restringe os valores e o CHECK da coluna, nao o tipo Drizzle de um array de integer. */
  notifyOffsetsMinutes: number[];
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
    notifyOffsetsMinutes: row.notifyOffsetsMinutes as NotificationOffsetMinutes[],
    tags: [...tagNames],
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    dependsOnTaskIds: [...dependsOnTaskIds],
    occurrence: occurrenceLinkOf(row),
    revision: row.revision,
  });
}
