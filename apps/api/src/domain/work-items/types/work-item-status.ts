export const WORK_ITEM_STATUSES = ["todo", "scheduled", "toDefine", "inHold", "done", "cancel"] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const DEFAULT_WORK_ITEM_STATUS: WorkItemStatus = "todo";

export function isWorkItemStatus(value: unknown): value is WorkItemStatus {
  return WORK_ITEM_STATUSES.includes(value as WorkItemStatus);
}
