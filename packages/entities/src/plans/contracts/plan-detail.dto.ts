import type { WorkItemStatus } from "../../work-items/types/work-item-status";
import type { WorkItemPriority } from "../../work-items/types/work-item-priority";

export interface PlanDetailDto {
  id: string;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
  revision: number;
}
