import { existsSync } from "node:fs";
import { SqliteDatabase } from "./database";
import { migrateDatabase, type Migration } from "./migrate";

export interface OpenMigratedOptions {
  migrations: readonly Migration[];
  /** O banco em memoria dos testes de unidade: um escritor so e nenhuma copia. */
  memory?: boolean;
  /** Onde contar a copia e as migrations aplicadas. */
  log?: (message: string) => void;
}

/**
 * Abre o arquivo e aplica as migrations pendentes antes de devolver o banco (ADR 0024). Antes de mudar um schema que
 * ja tem historico, guarda uma copia consistente ao lado do arquivo (`<arquivo>.antes-de-<migration>.sqlite`).
 */
export function openMigratedDatabase(path: string, options: OpenMigratedOptions): SqliteDatabase {
  const database = SqliteDatabase.open(path, { memory: options.memory });
  try {
    const applied = migrateDatabase(database.handle, {
      migrations: options.migrations,
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
        options.log?.(`Copia do banco antes das migrations: ${target}`);
      },
    });
    if (applied.length > 0) options.log?.(`Migrations aplicadas: ${applied.join(", ")}`);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
