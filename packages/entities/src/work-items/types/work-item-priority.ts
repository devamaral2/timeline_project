export const WORK_ITEM_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export const DEFAULT_WORK_ITEM_PRIORITY: WorkItemPriority = "medium";

export function isWorkItemPriority(value: unknown): value is WorkItemPriority {
  return WORK_ITEM_PRIORITIES.includes(value as WorkItemPriority);
}
