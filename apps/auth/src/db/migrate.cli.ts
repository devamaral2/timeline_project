import { getDatabaseEnv, loadRootEnv } from "../config/env";
import { findMonorepoRoot } from "../config/load-env";
import { openAuthDatabase } from "./client";

/**
 * `pnpm --filter @repo/auth run db:migrate`: aplica as migrations no arquivo do auth sem subir o servidor. O auth faz o
 * mesmo ao abrir o banco; o comando serve ao provisionamento das worktrees e a quem quer conferir uma migration antes.
 */
async function main(): Promise<void> {
  const { databasePath } = getDatabaseEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  const database = openAuthDatabase(databasePath, { log: (message) => console.log(message) });
  await database.close();
  console.log(`Banco do auth migrado: ${databasePath}`);
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "migration failed"); process.exitCode = 1; });
