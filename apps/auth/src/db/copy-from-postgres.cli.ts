import { Pool } from "pg";
import { getDatabaseEnv, getPostgresCopyEnv, loadRootEnv } from "../config/env";
import { findMonorepoRoot } from "../config/load-env";
import { openAuthDatabase } from "./client";
import { copyAuthDataFromPostgres } from "./copy-from-postgres";

/**
 * `pnpm --filter @repo/auth run db:copy-from-postgres`: copia uma vez os dados do auth do Postgres antigo
 * (`AUTH_DATABASE_URL`) para o arquivo SQLite (`AUTH_DATABASE_PATH`). Recusa um SQLite que ja tenha usuarios.
 *
 * Com `--url-from-stdin`, a URL do Postgres vem pela entrada padrao: e como o runbook roda a copia dentro do pod do
 * auth, sem a senha do Postgres na linha de comando nem no ambiente do container.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const source = loadRootEnv(findMonorepoRoot(__dirname), process.env);
  const { postgresUrl } = process.argv.includes("--url-from-stdin")
    ? getPostgresCopyEnv({ AUTH_DATABASE_URL: await readStdin() })
    : getPostgresCopyEnv(source);
  const { databasePath } = getDatabaseEnv(source);
  const pool = new Pool({ connectionString: postgresUrl, max: 1 });
  const target = openAuthDatabase(databasePath, { log: (message) => console.log(message) });
  try {
    const { copied } = await copyAuthDataFromPostgres(pool, target);
    for (const [table, rows] of Object.entries(copied)) console.log(`${table}: ${rows}`);
    console.log(`Dados do auth copiados para ${databasePath}`);
  } finally {
    await target.close();
    await pool.end();
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "copy failed"); process.exitCode = 1; });
