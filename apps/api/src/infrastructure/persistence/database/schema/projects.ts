import { boolean, char, check, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { MAX_PROJECT_NAME_LENGTH } from "../../../../domain/projects/types/project-name";

/** O nome do projeto padrao: toda tarefa sem escolha fica nele. */
export const PERSONAL_PROJECT_NAME = "personal";

/**
 * Onde uma tarefa de pessoa ou de agente fica guardada (ADR 0022). O nome e unico por usuario sem distinguir
 * maiusculas, e cada usuario tem no maximo um `personal`, o projeto padrao.
 */
export const projects = pgTable(
  "projects",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    personal: boolean("personal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_user_name_unique").on(table.userId, sql`lower(${table.name})`),
    uniqueIndex("projects_user_personal_unique")
      .on(table.userId)
      .where(sql`${table.personal}`),
    // O nome ja vem sem os espacos das pontas: guardar `" a"` e um erro de quem grava.
    check(
      "projects_name_shape",
      sql`${table.name} = btrim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND ${sql.raw(String(MAX_PROJECT_NAME_LENGTH))}`,
    ),
    check("projects_personal_name", sql`NOT ${table.personal} OR ${table.name} = ${sql.raw(`'${PERSONAL_PROJECT_NAME}'`)}`),
  ],
);
