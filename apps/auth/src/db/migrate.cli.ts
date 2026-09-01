import { resolve } from "node:path";
import { getMigrationEnv, loadRootEnv } from "../config/env";
import { migrateAuthDatabase } from "./migrate";

async function main(): Promise<void> {
  const env = getMigrationEnv(loadRootEnv(process.cwd(), process.env));
  await migrateAuthDatabase({ migrationDatabaseUrl: env.databaseMigrationUrl, migrationsFolder: resolve(__dirname, "../../drizzle") });
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "migration failed"); process.exitCode = 1; });
