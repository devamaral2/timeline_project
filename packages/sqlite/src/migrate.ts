import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "./node-sqlite";

/**
 * O migrador do banco da API (ADR 0024). Junta o que deu certo no t3code, no hermes-agent e no ai-memory
 * (docs/research/sqlite-aprendizados.md, 5.5):
 *
 * - **registro por arquivo**, com nome e checksum: uma migration mergeada fora de ordem roda, em vez de ser pulada;
 * - **uma transacao por arquivo, aberta com `BEGIN IMMEDIATE`**, com o registro gravado nela;
 * - **chaves estrangeiras desligadas em volta do runner**, fora de qualquer transacao (`PRAGMA foreign_keys` dentro
 *   de uma transacao nao faz nada, e o `DROP TABLE` de uma reconstrucao apagaria as filhas em cascata), e
 *   `foreign_key_check` antes de cada commit;
 * - **recusa um banco de versao mais nova**: uma migration registrada que este build nao conhece para tudo;
 * - **recusa uma migration editada** depois de aplicada (checksum diferente).
 *
 * Os arquivos `NNNN_nome.sql` de cada app (`apps/api/migrations`, `apps/auth/migrations`) sao imutaveis depois de
 * mergeados: a correcao e um arquivo novo.
 */

const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface Migration {
  name: string;
  sql: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((file) => FILE_PATTERN.test(file))
    .sort()
    .map((file) => ({ name: file, sql: readFileSync(join(dir, file), "utf8") }));
}

function checksum(text: string): string {
  // O fim de linha nao muda a migration (o ai-memory perdeu checksums para o CRLF).
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}

interface Applied {
  name: string;
  checksum: string;
}

function ensureRegistry(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
}

function appliedOf(db: DatabaseSync): Applied[] {
  return db.prepare("SELECT name, checksum FROM schema_migrations ORDER BY name").all() as unknown as Applied[];
}

/** O que falta aplicar; falha se o banco tem migration que este build nao conhece ou que foi editada. */
export function pendingMigrations(db: DatabaseSync, migrations: readonly Migration[]): Migration[] {
  ensureRegistry(db);
  const known = new Map(migrations.map((migration) => [migration.name, migration]));
  const applied = appliedOf(db);
  const unknown = applied.filter((row) => !known.has(row.name));
  if (unknown.length > 0) {
    throw new MigrationError(
      `The database was migrated by a newer build (${unknown.map((row) => row.name).join(", ")}). ` +
        "Run a build at least as new as the one that wrote it; the database was not changed.",
    );
  }
  for (const row of applied) {
    if (known.get(row.name) && checksum(known.get(row.name)!.sql) !== row.checksum) {
      throw new MigrationError(`Migration ${row.name} changed after it was applied; add a new migration instead.`);
    }
  }
  const done = new Set(applied.map((row) => row.name));
  return migrations.filter((migration) => !done.has(migration.name));
}

export interface MigrateOptions {
  migrations: readonly Migration[];
  /** Chamado com o que falta, antes de aplicar: o backup antes de mudar o schema. */
  beforeApply?: (pending: readonly Migration[]) => void;
}

/** Aplica as migrations pendentes. Devolve os nomes aplicados. */
export function migrateDatabase(db: DatabaseSync, options: MigrateOptions): string[] {
  const { migrations } = options;
  const pending = pendingMigrations(db, migrations);
  if (pending.length === 0) return [];
  options.beforeApply?.(pending);

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const migration of pending) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(migration.sql);
        const broken = db.prepare("PRAGMA foreign_key_check").all();
        if (broken.length > 0) {
          throw new MigrationError(`Migration ${migration.name} left ${broken.length} broken foreign key(s)`);
        }
        db.prepare("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)").run(
          migration.name,
          checksum(migration.sql),
        );
        db.exec("COMMIT");
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
      }
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  return pending.map((migration) => migration.name);
}
