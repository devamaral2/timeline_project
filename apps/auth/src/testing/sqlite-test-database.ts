import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe } from "vitest";
import { openAuthDatabase, type AuthDatabase } from "../db/client";

export const describeWithDatabase = describe;

export interface AuthTestDatabase {
  /** O arquivo SQLite migrado deste teste. */
  path: string;
  /** Uma conexao nova ao arquivo, como o servidor ou um CLI abriria. */
  open(): AuthDatabase;
  /** Fecha as conexoes abertas por `open` e apaga o arquivo. */
  close(): Promise<void>;
}

/**
 * Um arquivo SQLite migrado num diretorio temporario por teste (ADR 0025): substitui o schema por teste no Postgres do
 * Testcontainers e o papel `auth_runtime`, que nao existe mais. Arquivo, e nao `:memory:`, para os testes passarem
 * pelo WAL e por conexoes separadas ao mesmo banco.
 */
export async function createAuthTestDatabase(): Promise<AuthTestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "auth-test-"));
  const path = join(dir, "auth.sqlite");
  const opened: AuthDatabase[] = [];
  const open = () => {
    const database = openAuthDatabase(path);
    opened.push(database);
    return database;
  };
  await open().close();
  return {
    path,
    open,
    async close() {
      for (const database of opened) await database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
