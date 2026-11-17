import {
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { RECURRENCE_FREQS, sqlList } from "./sets";

/**
 * A regra de uma serie de tarefas. As ocorrencias vivem em `tasks`, apontando
 * para ca por `recurrence_id`; esta tabela guarda so a regra, o template que
 * cada ocorrencia copia e ate onde elas ja foram geradas.
 *
 * So tarefa tem serie, entao nao ha `target_kind`. O template leva o modelo do
 * tarefa e a lista de artefatos que cada ocorrencia usa.
 */
export const recurrences = pgTable(
  "recurrences",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    freq: text("freq", { enum: RECURRENCE_FREQS }).notNull(),
    // `interval` e palavra reservada do Postgres.
    intervalCount: smallint("interval_count").notNull().default(1),
    // Mascara de 7 bits, bit 0 = domingo.
    byWeekday: smallint("byweekday"),
    byMonthDay: smallint("bymonthday"),
    byMonth: smallint("bymonth"),
    // Hora de parede no fuso da regra: 07:00 continua 07:00 depois do horario de verao.
    timeOfDay: time("time_of_day").notNull(),
    durationMinutes: integer("duration_minutes"),
    timeZone: text("time_zone").notNull().default("America/Sao_Paulo"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    template: jsonb("template").notNull(),
    // Ultimo dia civil ja gerado. Nulo e nada gerado ainda.
    materializedThrough: date("materialized_through"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("recurrences_user_idx").on(table.userId),
    index("recurrences_pending_idx").on(table.userId, table.materializedThrough),
    check("recurrences_revision_min", sql`${table.revision} >= 1`),
    check("recurrences_freq_valid", sql`${table.freq} IN (${sqlList(RECURRENCE_FREQS)})`),
    check("recurrences_interval_min", sql`${table.intervalCount} >= 1`),
    check("recurrences_byweekday_shape", sql`(${table.freq} = 'weekly') = (${table.byWeekday} IS NOT NULL)`),
    check("recurrences_byweekday_range", sql`${table.byWeekday} IS NULL OR ${table.byWeekday} BETWEEN 1 AND 127`),
    check(
      "recurrences_bymonthday_shape",
      sql`(${table.freq} IN ('monthly', 'yearly')) = (${table.byMonthDay} IS NOT NULL)`,
    ),
    check("recurrences_bymonthday_range", sql`${table.byMonthDay} IS NULL OR ${table.byMonthDay} BETWEEN 1 AND 31`),
    check("recurrences_bymonth_shape", sql`(${table.freq} = 'yearly') = (${table.byMonth} IS NOT NULL)`),
    check("recurrences_bymonth_range", sql`${table.byMonth} IS NULL OR ${table.byMonth} BETWEEN 1 AND 12`),
    check("recurrences_ends_after_starts", sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`),
    check("recurrences_duration_positive", sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} > 0`),
    check("recurrences_template_object", sql`jsonb_typeof(${table.template}) = 'object'`),
  ],
);

/**
 * Dias pulados de uma serie. Sem esta linha, apagar uma ocorrencia so duraria
 * ate a proxima vez que a serie fosse editada e regerada.
 */
export const recurrenceExceptions = pgTable(
  "recurrence_exceptions",
  {
    // `cascade`: uma excecao sem a regra dela nao quer dizer nada.
    recurrenceId: char("recurrence_id", { length: 26 })
      .notNull()
      .references(() => recurrences.id, { onDelete: "cascade" }),
    occurrenceOn: date("occurrence_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.recurrenceId, table.occurrenceOn] })],
);
