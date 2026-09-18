import { char, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events } from "./events";
import { tasks } from "./tasks";

export const notes = pgTable(
  "notes",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    content: text("content").notNull(),
    // `set null`: a nota e conteudo do usuario e sobrevive ao hard delete que a
    // edicao de uma serie ainda faz nas ocorrencias futuras. O soft delete do
    // alvo apaga a nota em codigo, junto com ele.
    eventId: char("event_id", { length: 26 }).references(() => events.id, { onDelete: "set null" }),
    taskId: char("task_id", { length: 26 }).references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("notes_user_idx").on(table.userId),
    index("notes_event_idx").on(table.eventId),
    index("notes_task_idx").on(table.taskId),
    check("notes_revision_min", sql`${table.revision} >= 1`),
    check("notes_content_not_blank", sql`btrim(${table.content}) <> ''`),
  ],
);
