import {
  char,
  check,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workItemPriorityEnum, workItemStatusEnum } from "./enums";
import { tags } from "./events";

export const tasks = pgTable(
  "tasks",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    // Subtarefa: aponta para a tarefa de que esta e filha. `cascade` porque uma
    // subtarefa so existe dentro do pai — apagar o pai apaga a arvore inteira,
    // ao contrario do `set null` que o plano usava.
    parentTaskId: char("parent_task_id", { length: 26 }).references(
      (): AnyPgColumn => tasks.id,
      { onDelete: "cascade" },
    ),
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
    index("tasks_user_idx").on(table.userId),
    index("tasks_parent_idx").on(table.parentTaskId),
    check("tasks_revision_min", sql`${table.revision} >= 1`),
    // Ciclos mais longos o banco nao consegue barrar; quem barra e
    // `assertParentTaskAssignable` em apps/api, subindo a cadeia de pais.
    check(
      "tasks_parent_not_self",
      sql`${table.parentTaskId} IS NULL OR ${table.parentTaskId} <> ${table.id}`,
    ),
    check(
      "tasks_finished_after_started",
      sql`${table.startedAt} IS NULL OR ${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: char("task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.tagId] }),
    index("task_tags_tag_idx").on(table.tagId, table.taskId),
  ],
);
