import { char, check, index, primaryKey, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tasks } from "./tasks";

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: char("task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: char("depends_on_task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index("task_dependencies_reverse_idx").on(table.dependsOnTaskId, table.taskId),
    check("task_dependencies_no_self_reference", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
  ],
);
