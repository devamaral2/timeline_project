import {
  boolean,
  char,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { artifacts } from "./artifacts";
import { events } from "./events";
import { ARTIFACT_ARTIFACT_RELATIONS, EVENT_ARTIFACT_RELATIONS, EVENT_EVENT_RELATIONS, sqlList } from "./sets";

/**
 * Relacoes com sentido (ADR 0012): de quem produz para o que foi produzido.
 * Uma tabela por par de entidades, cada uma com o seu conjunto de tipos.
 *
 * Nao existe `parent_id`: subtarefa e a relacao `subtask`, bloqueio e `blocks`
 * e a sessao de conversa e a estrela `follow_up` do primeiro pedido para cada
 * continuacao. Ciclos e o dono das duas pontas sao conferidos na escrita.
 */
export const eventEventRelation = pgTable(
  "event_event_relation",
  {
    fromEventId: char("from_event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    toEventId: char("to_event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: EVENT_EVENT_RELATIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // As leituras sao sempre "de X, por tipo" e "para X, por tipo".
    primaryKey({ columns: [table.fromEventId, table.relation, table.toEventId] }),
    uniqueIndex("event_event_reverse_idx").on(table.toEventId, table.relation, table.fromEventId),
    // Cada continuacao tem um so primeiro pedido.
    uniqueIndex("event_event_follow_up_unique")
      .on(table.toEventId)
      .where(sql`${table.relation} = 'follow_up'`),
    check("event_event_relation_valid", sql`${table.relation} IN (${sqlList(EVENT_EVENT_RELATIONS)})`),
    check("event_event_not_self", sql`${table.fromEventId} <> ${table.toEventId}`),
  ],
);

/**
 * Parte sempre do evento, que cria, altera, usa ou apaga o artefato. Uma linha
 * por par: se o evento criou e depois alterou o artefato, a relacao continua
 * `creates`.
 *
 * `position` e a ordem na lista do evento e fica nula na relacao de um passo de
 * agente. `UNIQUE (event_id, position)` e `DEFERRABLE` na migration (o Drizzle
 * nao gera isso): reordenar com `position = position + 1` nao colide no meio do
 * UPDATE.
 *
 * `from_recurrence` separa o vinculo herdado da serie do vinculo feito so nesta
 * ocorrencia, para que editar um nao mexa no outro.
 */
export const eventArtifactRelation = pgTable(
  "event_artifact_relation",
  {
    eventId: char("event_id", { length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    artifactId: char("artifact_id", { length: 26 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: EVENT_ARTIFACT_RELATIONS }).notNull(),
    position: smallint("position"),
    fromRecurrence: boolean("from_recurrence").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.artifactId] }),
    unique("event_artifact_event_position_unique").on(table.eventId, table.position),
    index("event_artifact_reverse_idx").on(table.artifactId, table.eventId),
    check("event_artifact_relation_valid", sql`${table.relation} IN (${sqlList(EVENT_ARTIFACT_RELATIONS)})`),
    check("event_artifact_position_nonneg", sql`${table.position} IS NULL OR ${table.position} >= 0`),
  ],
);

/** Do original para a copia. Uma copia tem um so original. */
export const artifactArtifactRelation = pgTable(
  "artifact_artifact_relation",
  {
    fromArtifactId: char("from_artifact_id", { length: 26 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    toArtifactId: char("to_artifact_id", { length: 26 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: ARTIFACT_ARTIFACT_RELATIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fromArtifactId, table.toArtifactId, table.relation] }),
    uniqueIndex("artifact_derives_copy_unique")
      .on(table.toArtifactId)
      .where(sql`${table.relation} = 'derives'`),
    check("artifact_artifact_relation_valid", sql`${table.relation} IN (${sqlList(ARTIFACT_ARTIFACT_RELATIONS)})`),
    check("artifact_artifact_not_self", sql`${table.fromArtifactId} <> ${table.toArtifactId}`),
  ],
);
