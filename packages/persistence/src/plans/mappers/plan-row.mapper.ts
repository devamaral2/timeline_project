import { Plan, type WorkItemPriority, type WorkItemStatus } from "@repo/entities";

export interface PlanRow {
  id: string;
  revision: number;
  userId: string;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  startedAt: Date | null;
  estimatedFinishAt: Date | null;
  finishedAt: Date | null;
}

export function mapPlanRow(
  row: PlanRow,
  tagNames: readonly string[],
  dependsOnPlanIds: readonly string[] = [],
): Plan {
  return Plan.rehydrate({
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    tags: [...tagNames],
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    dependsOnPlanIds: [...dependsOnPlanIds],
    revision: row.revision,
  });
}
