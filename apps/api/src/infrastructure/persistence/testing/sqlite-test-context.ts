import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openApiDatabase } from "../database/api-database";
import { sql, type SqliteDatabase } from "@repo/sqlite";
import type { Db } from "../shared/tx";

export interface SqliteTestContext {
  /** O banco, com escritor e leitor, como a aplicacao o usa. */
  database: SqliteDatabase;
  db: Db;
  path: string;
  /** SQL de conferencia com `$1`, `$2`..., no formato do `pool.query` do `pg` (sempre pelo escritor). */
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  /** Apaga os dados de todas as tabelas, menos o catalogo global de exercicios que a migration semeia. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

// Das folhas para as raizes; as chaves estrangeiras ficam desligadas so durante a limpeza.
const TABLES = [
  "jobs",
  "idempotency_keys",
  "task_entries",
  "task_tags",
  "artifact_tags",
  "task_task_relation",
  "task_artifact_relation",
  "artifact_artifact_relation",
  "recurrence_exceptions",
  "tasks",
  "recurrences",
  "tags",
  "projects",
] as const;

/**
 * Um arquivo SQLite migrado num diretorio temporario, um por arquivo de teste: substitui o banco por teste no
 * Postgres do Testcontainers. Arquivo, e nao `:memory:`, para os testes passarem pelo WAL e pelo leitor separado.
 */
export async function createSqliteTestContext(): Promise<SqliteTestContext> {
  const dir = mkdtempSync(join(tmpdir(), "api-test-"));
  const path = join(dir, "api.sqlite");
  const database = openApiDatabase(path);

  async function reset(): Promise<void> {
    const handle = database.handle;
    handle.exec("PRAGMA foreign_keys = OFF");
    try {
      handle.exec("BEGIN IMMEDIATE");
      for (const table of TABLES) handle.exec(`DELETE FROM ${table}`);
      handle.exec("DELETE FROM artifacts WHERE id NOT LIKE '01KDVDNA0%'");
      handle.exec("COMMIT");
    } finally {
      handle.exec("PRAGMA foreign_keys = ON");
    }
  }

  async function stop(): Promise<void> {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }

  const query = <T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) =>
    database.execute<T>(sql.unsafe(text, params));

  return { database, db: database, path, query, reset, stop };
}
