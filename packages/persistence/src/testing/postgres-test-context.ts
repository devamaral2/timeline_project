import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import * as schema from "../database/schema";

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
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:17-alpine",
  ).start();
  const connectionString = container.getConnectionUri();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  await migrate(db, {
    migrationsFolder: resolve(__dirname, "../../drizzle"),
  });

  async function reset(): Promise<void> {
    await pool.query(
      `TRUNCATE ${MUTABLE_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
    );
  }

  async function stop(): Promise<void> {
    await pool.end();
    await container.stop();
  }

  return { db, pool, connectionString, reset, stop };
}

export { sql };
