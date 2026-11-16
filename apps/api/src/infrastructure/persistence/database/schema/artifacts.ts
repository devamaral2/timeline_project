import { boolean, char, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ARTIFACT_TYPES, GLOBAL_ARTIFACT_TYPES, sqlList } from "./sets";

/**
 * Objeto que guarda conteudo e nao e fluxo: nao tem status, horario nem
 * executor (ADR 0011). Substitui a nota e os catalogos de alimento e exercicio.
 *
 * `user_id` nulo e o artefato global: todos leem, ninguem edita pelo app.
 * `derived` marca a copia de outro artefato (o alimento comido numa tarefa), para
 * que a lista por tipo nao precise consultar `artifact_artifact_relation`.
 */
export const artifacts = pgTable(
  "artifacts",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id"),
    type: text("type", { enum: ARTIFACT_TYPES }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    name: text("name").notNull(),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    derived: boolean("derived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Lista por tipo, da mais recente para a mais antiga, sem as copias.
    index("artifacts_user_type_recent_idx")
      .on(table.userId, table.type, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL AND NOT ${table.derived}`),
    // Catalogo global por nome.
    index("artifacts_global_idx")
      .on(table.type, table.name)
      .where(sql`${table.userId} IS NULL AND ${table.deletedAt} IS NULL`),
    // Exercicio global pelo codigo.
    uniqueIndex("artifacts_workout_code_unique")
      .on(sql`(data ->> 'code')`)
      .where(sql`${table.type} = 'workout' AND ${table.userId} IS NULL`),
    // Um artefato por arquivo de skill ou de agente (ADR 0005).
    uniqueIndex("artifacts_agent_file_unique")
      .on(table.userId, sql`(data ->> 'path')`)
      .where(sql`${table.type} IN ('skill', 'agent') AND ${table.deletedAt} IS NULL`),
    check("artifacts_revision_min", sql`${table.revision} >= 1`),
    check("artifacts_schema_version_min", sql`${table.schemaVersion} >= 1`),
    check("artifacts_type_valid", sql`${table.type} IN (${sqlList(ARTIFACT_TYPES)})`),
    check("artifacts_data_object", sql`jsonb_typeof(${table.data}) = 'object'`),
    check(
      "artifacts_global_only_catalog",
      sql`${table.userId} IS NOT NULL OR ${table.type} IN (${sqlList(GLOBAL_ARTIFACT_TYPES)})`,
    ),
  ],
);
