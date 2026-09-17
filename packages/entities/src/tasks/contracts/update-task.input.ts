import type { WorkItemStatus } from "../../work-items/types/work-item-status";
import type { WorkItemPriority } from "../../work-items/types/work-item-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";

export interface UpdateTaskInput {
  taskId: string;
  expectedRevision: number;
  parentTaskId?: string | null;
  name?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
  dependsOnTaskIds?: string[];
}
