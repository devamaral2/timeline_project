import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { inject } from "vitest";
import * as schema from "../database/schema";

declare module "vitest" {
  interface ProvidedContext { apiPostgresUrl: string }
}

export interface PostgresTestContext {
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  connectionString: string;
  reset(): Promise<void>;
  stop(): Promise<void>;
}

// Os filhos saem pelo CASCADE do TRUNCATE. `artifacts` fica de fora: os exercicios globais vem da migration.
const ROOT_TABLES = ["tasks", "tags", "recurrences", "jobs", "idempotency_keys"] as const;

async function dropDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const cleanup = new Client({ connectionString: adminUrl });
  await cleanup.connect();
  try {
    await cleanup.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await cleanup.end();
  }
}

/**
 * Um banco vazio com a migration do banco novo (`drizzle`) aplicada. E o
 * par de `createPostgresTestContext` enquanto os dois esquemas convivem.
 */
export async function createPostgresTestContext(): Promise<PostgresTestContext> {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const connectionString = databaseUrl.toString();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    await migrate(db, { migrationsFolder: resolve(__dirname, "../../../../drizzle") });
  } catch (error) {
    await pool.end();
    await dropDatabase(adminUrl, databaseName);
    throw error;
  }

  async function reset(): Promise<void> {
    await pool.query(`TRUNCATE ${ROOT_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    await pool.query("DELETE FROM artifacts WHERE id NOT LIKE '01KDVDNA0%'");
  }

  async function stop(): Promise<void> {
    await pool.end();
    await dropDatabase(adminUrl, databaseName);
  }

  return { db, pool, connectionString, reset, stop };
}
