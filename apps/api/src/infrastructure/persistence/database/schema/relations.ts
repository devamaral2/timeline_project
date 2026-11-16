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
import { tasks } from "./tasks";
import { ARTIFACT_ARTIFACT_RELATIONS, TASK_ARTIFACT_RELATIONS, TASK_TASK_RELATIONS, sqlList } from "./sets";

/**
 * Relacoes com sentido (ADR 0012): de quem produz para o que foi produzido.
 * Uma tabela por par de entidades, cada uma com o seu conjunto de tipos.
 *
 * Nao existe `parent_id`: a ordem entre tarefas e a relacao `precedes`, do
 * antecessor para o sucessor ("segue-se de" e "da sequencia a" sao os dois
 * lados dela), e a sessao de conversa e a estrela `follow_up` do primeiro
 * pedido para cada continuacao. Ciclos e o dono das duas pontas sao
 * conferidos na escrita.
 */
export const taskTaskRelation = pgTable(
  "task_task_relation",
  {
    fromTaskId: char("from_task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toTaskId: char("to_task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: TASK_TASK_RELATIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // As leituras sao sempre "de X, por tipo" e "para X, por tipo".
    primaryKey({ columns: [table.fromTaskId, table.relation, table.toTaskId] }),
    uniqueIndex("task_task_reverse_idx").on(table.toTaskId, table.relation, table.fromTaskId),
    // Cada continuacao tem um so primeiro pedido.
    uniqueIndex("task_task_follow_up_unique")
      .on(table.toTaskId)
      .where(sql`${table.relation} = 'follow_up'`),
    check("task_task_relation_valid", sql`${table.relation} IN (${sqlList(TASK_TASK_RELATIONS)})`),
    check("task_task_not_self", sql`${table.fromTaskId} <> ${table.toTaskId}`),
  ],
);

/**
 * Parte sempre da tarefa, que cria, altera, usa ou apaga o artefato. Uma linha
 * por par: se a tarefa criou e depois alterou o artefato, a relacao continua
 * `creates`.
 *
 * `position` e a ordem na lista da tarefa e fica nula na relacao de um passo de
 * agente. `UNIQUE (task_id, position)` e `DEFERRABLE` na migration (o Drizzle
 * nao gera isso): reordenar com `position = position + 1` nao colide no meio do
 * UPDATE.
 *
 * `from_recurrence` separa o vinculo herdado da serie do vinculo feito so nesta
 * ocorrencia, para que editar um nao mexa no outro.
 */
export const taskArtifactRelation = pgTable(
  "task_artifact_relation",
  {
    taskId: char("task_id", { length: 26 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    artifactId: char("artifact_id", { length: 26 })
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: TASK_ARTIFACT_RELATIONS }).notNull(),
    position: smallint("position"),
    fromRecurrence: boolean("from_recurrence").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.artifactId] }),
    unique("task_artifact_task_position_unique").on(table.taskId, table.position),
    index("task_artifact_reverse_idx").on(table.artifactId, table.taskId),
    check("task_artifact_relation_valid", sql`${table.relation} IN (${sqlList(TASK_ARTIFACT_RELATIONS)})`),
    check("task_artifact_position_nonneg", sql`${table.position} IS NULL OR ${table.position} >= 0`),
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
