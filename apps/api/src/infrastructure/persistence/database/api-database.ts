import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { loadMigrations, migrateDatabase, SqliteDatabase, type Migration } from "@repo/sqlite";

/** As migrations da API, em `apps/api/migrations` (a partir de `src` ou de `dist`). */
export const API_MIGRATIONS_DIR = resolve(__dirname, "../../../../migrations");

export interface OpenApiDatabaseOptions {
  migrations?: readonly Migration[];
  /** O banco em memoria dos testes de unidade: um escritor so e nenhum backup. */
  memory?: boolean;
}

/**
 * Abre o arquivo da API e aplica as migrations pendentes antes de devolver o banco (ADR 0024). Com uma replica so e
 * o arquivo no volume dela, migrar na subida substitui o container descartavel do `db:migrate` do Postgres. Antes de
 * mudar um schema que ja tem historico, guarda uma copia ao lado do arquivo.
 */
export function openApiDatabase(path: string, options: OpenApiDatabaseOptions = {}): SqliteDatabase {
  const database = SqliteDatabase.open(path, { memory: options.memory });
  try {
    const applied = migrateDatabase(database.handle, {
      migrations: options.migrations ?? loadMigrations(API_MIGRATIONS_DIR),
      beforeApply: (pending) => {
        if (options.memory) return;
        const { count } = database.handle.prepare("SELECT count(*) AS count FROM schema_migrations").get() as {
          count: number;
        };
        if (count === 0) return;
        const base = `${path}.antes-de-${pending[0]!.name.replace(/\.sql$/, "")}`;
        // `VACUUM INTO` nao sobrescreve: uma tentativa anterior que falhou ja deixou a copia dela.
        const target = existsSync(`${base}.sqlite`) ? `${base}-${Date.now()}.sqlite` : `${base}.sqlite`;
        database.handle.prepare("VACUUM INTO ?").run(target);
        Logger.log(`Copia do banco antes das migrations: ${target}`, "Database");
      },
    });
    if (applied.length > 0) Logger.log(`Migrations aplicadas: ${applied.join(", ")}`, "Database");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
