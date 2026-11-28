import { resolve } from "node:path";
import { Logger } from "../../../common/logger";
import { loadMigrations, openMigratedDatabase, type Migration, type SqliteDatabase } from "@repo/sqlite";

/** As migrations da API, em `apps/api/migrations` (a partir de `src` ou de `dist`). */
export const API_MIGRATIONS_DIR = resolve(__dirname, "../../../../migrations");

export interface OpenApiDatabaseOptions {
  migrations?: readonly Migration[];
  /** O banco em memoria dos testes de unidade: um escritor so e nenhum backup. */
  memory?: boolean;
}

/**
 * Abre o arquivo da API e aplica as migrations pendentes antes de devolver o banco (ADR 0024). Com uma replica so e
 * o arquivo no volume dela, migrar na subida substitui o container descartavel do `db:migrate` do Postgres.
 */
export function openApiDatabase(path: string, options: OpenApiDatabaseOptions = {}): SqliteDatabase {
  return openMigratedDatabase(path, {
    migrations: options.migrations ?? loadMigrations(API_MIGRATIONS_DIR),
    memory: options.memory,
    log: (message) => new Logger("Database").log(message),
  });
}
