import type { WorkItemStatus } from "../../work-items/types/work-item-status";
import type { WorkItemPriority } from "../../work-items/types/work-item-priority";

export interface TaskSummaryDto {
  id: string;
  parentTaskId?: string;
  name: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
}
