import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { recurrences } from "./recurrences";
import {
  ACTORS,
  AGENT_KINDS,
  AGENT_STATUSES,
  ENTRY_KINDS,
  ENTRY_ROLES,
  EVENT_KINDS,
  EVENT_STATUSES,
  HUMAN_KINDS,
  HUMAN_STATUSES,
  PRIORITIES,
  sqlList,
} from "./sets";

/**
 * O que uma pessoa ou um agente faz ou vai fazer (ADR 0011). E a unica entidade
 * de acao: tarefa, pedido a IA e passo de agente sao eventos.
 *
 * `started_at` e o inicio planejado, `estimated_finish_at` o fim planejado (o
 * bloco da agenda, ou o prazo num evento longo) e `finished_at` a conclusao
 * real. Nao ha check entre `finished_at` e `started_at`: concluir hoje um evento
 * marcado para amanha e valido.
 */
export const events = pgTable(
  "events",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    actor: text("actor", { enum: ACTORS }).notNull(),
    kind: text("kind", { enum: EVENT_KINDS }).notNull(),
    // Nulo e o evento de referencia: so marca um horario na agenda.
    status: text("status", { enum: EVENT_STATUSES }),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }),
    estimatedFinishAt: timestamp("estimated_finish_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    notifyOffsetsMinutes: integer("notify_offsets_minutes")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    // Ocorrencia de uma serie. `set null`: apagar a regra nao apaga o que ja
    // aconteceu — a ocorrencia passada e historia e so perde o vinculo.
    recurrenceId: char("recurrence_id", { length: 26 }).references((): AnyPgColumn => recurrences.id, {
      onDelete: "set null",
    }),
    occurrenceOn: date("occurrence_on"),
    recurrenceDetached: boolean("recurrence_detached").notNull().default(false),
    // Evento de pessoa que fica fora da agenda, como um projeto.
    longRunning: boolean("long_running").notNull().default(false),
    // Pequeno: resumo ou resposta final do agente, agente interno de um passo,
    // contexto de tela. O que cresce vai para `event_entries`.
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Exclusao logica: a linha fica para a deteccao de ocorrencia ja gerada
    // (indice unico abaixo) e toda leitura filtra `deleted_at IS NULL`.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Agenda: pessoa e agente, sem passos e sem eventos longos.
    index("events_agenda_idx")
      .on(table.userId, table.startedAt, table.id)
      .where(
        sql`${table.startedAt} IS NOT NULL AND NOT ${table.longRunning} AND ${table.kind} <> 'step' AND ${table.deletedAt} IS NULL`,
      ),
    // Lista de tarefas: tudo o que tem status, de pessoa e de agente, sem passos.
    index("events_tracked_idx")
      .on(table.userId, table.status, sql`(coalesce(started_at, estimated_finish_at))`, table.id)
      .where(sql`${table.status} IS NOT NULL AND ${table.kind} <> 'step' AND ${table.deletedAt} IS NULL`),
    // Pedidos do usuario, do mais novo para o mais antigo.
    index("events_requests_idx")
      .on(table.userId, table.id.desc())
      .where(sql`${table.actor} = 'agent' AND ${table.kind} <> 'step' AND ${table.deletedAt} IS NULL`),
    // Todos os eventos vivos de pessoa: agente de consulta e busca por nome.
    index("events_user_live_idx")
      .on(table.userId, table.id)
      .where(sql`${table.actor} = 'human' AND ${table.deletedAt} IS NULL`),
    // A garantia de idempotencia da materializacao: duas leituras ao mesmo
    // tempo nao geram o mesmo dia duas vezes. Sem filtro de apagados, de
    // proposito: a ocorrencia apagada continua ocupando o dia.
    uniqueIndex("events_recurrence_occurrence_unique")
      .on(table.recurrenceId, table.occurrenceOn)
      .where(sql`${table.recurrenceId} IS NOT NULL`),
    check("events_revision_min", sql`${table.revision} >= 1`),
    check("events_actor_valid", sql`${table.actor} IN (${sqlList(ACTORS)})`),
    check("events_priority_valid", sql`${table.priority} IN (${sqlList(PRIORITIES)})`),
    check(
      "events_kind_matches_actor",
      sql`(${table.actor} = 'human' AND ${table.kind} IN (${sqlList(HUMAN_KINDS)})) OR (${table.actor} = 'agent' AND ${table.kind} IN (${sqlList(AGENT_KINDS)}))`,
    ),
    // `IS NOT NULL` explicito no ramo do agente: `NULL IN (...)` e nulo, e um
    // check nulo passa.
    check(
      "events_status_matches_actor",
      sql`(${table.actor} = 'human' AND (${table.status} IS NULL OR ${table.status} IN (${sqlList(HUMAN_STATUSES)}))) OR (${table.actor} = 'agent' AND ${table.status} IS NOT NULL AND ${table.status} IN (${sqlList(AGENT_STATUSES)}))`,
    ),
    // Evento longo: de pessoa, com status, sem serie, nunca perdido.
    check(
      "events_long_running_shape",
      sql`NOT ${table.longRunning} OR (${table.actor} = 'human' AND ${table.status} IS NOT NULL AND ${table.status} <> 'missed' AND ${table.recurrenceId} IS NULL)`,
    ),
    // Os avisos de um evento longo contam a partir do prazo; sem prazo, nao ha aviso.
    check(
      "events_long_running_notify",
      sql`NOT ${table.longRunning} OR ${table.estimatedFinishAt} IS NOT NULL OR cardinality(${table.notifyOffsetsMinutes}) = 0`,
    ),
    // Fora do evento longo, o fim planejado nao vem antes do inicio e o bloco
    // dura no maximo 31 dias. No evento longo o inicio e o real e pode vir
    // depois do prazo.
    check(
      "events_block_span",
      sql`${table.longRunning} OR ${table.startedAt} IS NULL OR ${table.estimatedFinishAt} IS NULL OR (${table.estimatedFinishAt} >= ${table.startedAt} AND ${table.estimatedFinishAt} - ${table.startedAt} <= interval '31 days')`,
    ),
    // Implicacao, e nao bicondicional: o `set null` do FK mexe numa coluna so.
    check("events_occurrence_requires_day", sql`${table.recurrenceId} IS NULL OR ${table.occurrenceOn} IS NOT NULL`),
    // Numero livre (minutos ou dias, ja convertido para minutos) — o teto so
    // barra valor absurdo, nao restringe a um conjunto fixo.
    check(
      "events_notify_offsets_valid",
      sql`1 <= ALL(${table.notifyOffsetsMinutes}) AND 43200 >= ALL(${table.notifyOffsetsMinutes})`,
    ),
    check("events_data_object", sql`jsonb_typeof(${table.data}) = 'object'`),
  ],
);

/**
 * O que se acrescenta a um evento e nunca se altera: mensagem, pensamento,
 * trace, resultado e insumo de um passo (ADR 0013). Inserir aqui nao incrementa
 * a `revision` do evento. O id e um ULID e da a ordem.
 */
export const eventEntries = pgTable(
  "event_entries",
  {
    id: char("id", { length: 26 }).primaryKey(),
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
    // So em `message`.
    role: text("role", { enum: ENTRY_ROLES }),
    content: text("content"),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("event_entries_event_idx").on(table.eventId, table.id),
    check("event_entries_kind_valid", sql`${table.kind} IN (${sqlList(ENTRY_KINDS)})`),
    check("event_entries_role_only_in_message", sql`(${table.kind} = 'message') = (${table.role} IS NOT NULL)`),
    check("event_entries_role_valid", sql`${table.role} IS NULL OR ${table.role} IN (${sqlList(ENTRY_ROLES)})`),
    // O trace guarda so numeros e codigos, em `data`: nunca texto do usuario.
    check("event_entries_trace_without_text", sql`${table.kind} <> 'trace' OR ${table.content} IS NULL`),
    check("event_entries_data_object", sql`jsonb_typeof(${table.data}) = 'object'`),
  ],
);
