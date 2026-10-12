import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events, tags } from "./events";
import { recurrences } from "./recurrences";
import { tasks } from "./tasks";

/**
 * Uma note e conteudo do usuario com forma propria: `type` + `schema_version`
 * dizem qual JSON `data` carrega (texto, refeicao, treino, sono...). A forma de
 * cada tipo vive em `@repo/contracts`; o banco so garante que `data` e objeto.
 *
 * A note nao tem dono: ela se liga a eventos, tarefas e series pelas tabelas
 * de intersecao abaixo (N:N), e pode nao estar ligada a nada. Apagar o alvo
 * apaga so o vinculo — a note nunca some junto.
 */
export const notes = pgTable(
  "notes",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("Nota"),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete: os vinculos ficam e toda leitura filtra `deleted_at IS NULL`.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("notes_user_type_idx")
      .on(table.userId, table.type)
      .where(sql`${table.deletedAt} IS NULL`),
    check("notes_revision_min", sql`${table.revision} >= 1`),
    check("notes_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("notes_type_not_blank", sql`btrim(${table.type}) <> ''`),
    check("notes_schema_version_min", sql`${table.schemaVersion} >= 1`),
    check("notes_data_is_object", sql`jsonb_typeof(${table.data}) = 'object'`),
  ],
);

/**
 * Notes de um evento, na ordem em que aparecem nele.
 *
 * `UNIQUE (event_id, position)` e `DEFERRABLE` na migration (o Drizzle nao
 * gera isso): reordenar com `position = position + 1` nao colide no meio do
 * UPDATE.
 *
 * `from_recurrence` separa o vinculo herdado da serie do vinculo feito so
 * nesta ocorrencia, para que editar um nao mexa no outro.
 */
export const eventNotes = pgTable(
  "event_notes",
  {
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    noteId: char("note_id", { length: 26 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    fromRecurrence: boolean("from_recurrence").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.noteId] }),
    unique("event_notes_event_position_unique").on(table.eventId, table.position),
    index("event_notes_note_idx").on(table.noteId, table.eventId),
    check("event_notes_position_nonneg", sql`${table.position} >= 0`),
  ],
);

/** Notes de uma tarefa. Mesma forma de `event_notes`. */
export const taskNotes = pgTable(
  "task_notes",
  {
    taskId: char("task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    noteId: char("note_id", { length: 26 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    fromRecurrence: boolean("from_recurrence").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.noteId] }),
    unique("task_notes_task_position_unique").on(table.taskId, table.position),
    index("task_notes_note_idx").on(table.noteId, table.taskId),
    check("task_notes_position_nonneg", sql`${table.position} >= 0`),
  ],
);

/**
 * Notes ligadas a "todas as ocorrencias" de uma serie. A materializacao copia
 * estas linhas para `event_notes`/`task_notes` (com `from_recurrence = true`)
 * a cada ocorrencia futura que gera; a leitura nunca precisa juntar as duas.
 * A posicao aqui so vale para ocorrencias geradas depois do vinculo.
 */
export const recurrenceNotes = pgTable(
  "recurrence_notes",
  {
    recurrenceId: char("recurrence_id", { length: 26 })
      .notNull()
      .references(() => recurrences.id, { onDelete: "cascade" }),
    noteId: char("note_id", { length: 26 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recurrenceId, table.noteId] }),
    unique("recurrence_notes_recurrence_position_unique").on(table.recurrenceId, table.position),
    index("recurrence_notes_note_idx").on(table.noteId, table.recurrenceId),
    check("recurrence_notes_position_nonneg", sql`${table.position} >= 0`),
  ],
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: char("note_id", { length: 26 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: char("tag_id", { length: 26 })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tagId] }),
    index("note_tags_tag_idx").on(table.tagId, table.noteId),
  ],
);
