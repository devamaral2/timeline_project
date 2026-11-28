import { getDatabaseEnv } from "../../../config/env";
import { loadRootEnv } from "../../../config/load-env";
import { openApiDatabase } from "./api-database";

/**
 * `pnpm db:migrate`: aplica as migrations no arquivo da API sem subir o servidor. A API faz o mesmo na subida; o
 * comando serve ao provisionamento das worktrees e a quem quer conferir uma migration antes de subir.
 */
function main(): void {
  loadRootEnv();
  const path = getDatabaseEnv().API_DATABASE_PATH;
  openApiDatabase(path).close();
  console.log(`Banco da API migrado: ${path}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "migration failed");
  process.exitCode = 1;
}
