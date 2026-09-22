import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { inject } from "vitest";
import { sql } from "drizzle-orm";
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

const MUTABLE_TABLES = [
  "agent_chat_tickets",
  "agent_chat_messages",
  "agent_conversations",
  "note_tags",
  "notes",
  "recurrence_exceptions",
  "recurrences",
  "event_tags",
  "event_tasks",
  "event_interruptions",
  "event_items",
  "events",
  "task_tags",
  "task_dependencies",
  "tasks",
  "tags",
  "meal",
  "food",
] as const;

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
    await migrate(db, {
      migrationsFolder: resolve(__dirname, "../../../../drizzle"),
    });
  } catch (error) {
    await pool.end();
    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try { await cleanup.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await cleanup.end(); }
    throw error;
  }

  async function reset(): Promise<void> {
    await pool.query(
      `TRUNCATE ${MUTABLE_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
    );
  }

  async function stop(): Promise<void> {
    await pool.end();
    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try { await cleanup.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await cleanup.end(); }
  }

  return { db, pool, connectionString, reset, stop };
}

export { sql };
