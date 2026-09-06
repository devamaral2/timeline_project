import { char, index, primaryKey, pgTable } from "drizzle-orm/pg-core";
import { events } from "./events";
import { tasks } from "./tasks";

export const eventTasks = pgTable(
  "event_tasks",
  {
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    taskId: char("task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.taskId] }),
    index("event_tasks_task_idx").on(table.taskId, table.eventId),
  ],
);
