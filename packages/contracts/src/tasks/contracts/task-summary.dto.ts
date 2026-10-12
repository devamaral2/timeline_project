import type { WorkItemStatus } from "../../work-items/types/work-item-status";
import type { WorkItemPriority } from "../../work-items/types/work-item-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";

export interface TaskSummaryDto {
  id: string;
  parentTaskId?: string;
  name: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
  /** Ids das tarefas de que esta depende; o inverso e o que ela "libera". */
  dependsOnTaskIds: string[];
  /** Para o `PATCH` direto da lista (`expectedRevision`), sem ler o detalhe antes. */
  revision: number;
}
