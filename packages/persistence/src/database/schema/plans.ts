import {
  char,
  check,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workItemPriorityEnum, workItemStatusEnum } from "./enums";
import { tags } from "./events";

export const plans = pgTable(
  "plans",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: workItemStatusEnum("status").notNull().default("todo"),
    priority: workItemPriorityEnum("priority").notNull().default("medium"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    estimatedFinishAt: timestamp("estimated_finish_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("plans_user_idx").on(table.userId),
    check("plans_revision_min", sql`${table.revision} >= 1`),
    check(
      "plans_finished_after_started",
      sql`${table.startedAt} IS NULL OR ${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const planTags = pgTable(
  "plan_tags",
  {
    planId: char("plan_id", { length: 26 })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.tagId] }),
    index("plan_tags_tag_idx").on(table.tagId, table.planId),
  ],
);
