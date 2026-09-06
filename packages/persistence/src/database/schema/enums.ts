import { pgEnum } from "drizzle-orm/pg-core";

export const eventPriorityEnum = pgEnum("event_priority", ["urgent", "normal", "flexible"]);
export const catalogScopeEnum = pgEnum("catalog_scope", ["global", "user"]);
export const workItemStatusEnum = pgEnum("work_item_status", [
  "inHold",
  "todo",
  "inProgress",
  "done",
  "cancel",
]);
export const workItemPriorityEnum = pgEnum("work_item_priority", [
  "urgent",
  "high",
  "medium",
  "low",
]);
