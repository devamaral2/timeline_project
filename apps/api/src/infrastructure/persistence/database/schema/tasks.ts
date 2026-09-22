import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workItemPriorityEnum, workItemStatusEnum } from "./enums";
import { tags } from "./events";
import { recurrences } from "./recurrences";

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
    notifyOffsetsMinutes: integer("notify_offsets_minutes")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    estimatedFinishAt: timestamp("estimated_finish_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Ocorrencia de uma serie. `set null`: apagar a regra nao apaga o que ja
    // aconteceu — a ocorrencia passada e historia e so perde o vinculo.
    recurrenceId: char("recurrence_id", { length: 26 }).references(
      (): AnyPgColumn => recurrences.id,
      { onDelete: "set null" },
    ),
    occurrenceOn: date("occurrence_on"),
    recurrenceDetached: boolean("recurrence_detached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete, como em `events`. O `cascade` de `parent_task_id` so vale para
    // o hard delete que a edicao de serie ainda faz; o soft delete propaga a
    // arvore em codigo (`softDeleteTaskTree`).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_user_idx").on(table.userId),
    index("tasks_parent_idx").on(table.parentTaskId),
    check("tasks_revision_min", sql`${table.revision} >= 1`),
    // A garantia de idempotencia da materializacao: duas leituras ao mesmo
    // tempo nao geram o mesmo dia duas vezes.
    uniqueIndex("tasks_recurrence_occurrence_unique")
      .on(table.recurrenceId, table.occurrenceOn)
      .where(sql`${table.recurrenceId} IS NOT NULL`),
    index("tasks_recurrence_idx")
      .on(table.recurrenceId, table.startedAt)
      .where(sql`${table.recurrenceId} IS NOT NULL`),
    // Implicacao, e nao bicondicional: o `set null` do FK mexe numa coluna so.
    check(
      "tasks_occurrence_requires_day",
      sql`${table.recurrenceId} IS NULL OR ${table.occurrenceOn} IS NOT NULL`,
    ),
    // Ciclos mais longos o banco nao consegue barrar; quem barra e
    // `assertParentTaskAssignable` em apps/api, subindo a cadeia de pais.
    // Numero livre (minutos ou dias, ja convertido para minutos) — o teto so
    // barra valor absurdo, nao restringe a um conjunto fixo.
    check(
      "tasks_notify_offsets_valid",
      sql`1 <= ALL(${table.notifyOffsetsMinutes}) AND 43200 >= ALL(${table.notifyOffsetsMinutes})`,
    ),
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
