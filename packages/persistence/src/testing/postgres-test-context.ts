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
  reset(): Promise<void>;
  stop(): Promise<void>;
}

const MUTABLE_TABLES = [
  "event_tags",
  "event_interruptions",
  "event_items",
  "events",
  "tags",
  "meal",
  "food",
] as const;

export async function createPostgresTestContext(): Promise<PostgresTestContext> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:17-alpine",
  ).start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
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

  return { db, pool, reset, stop };
}

export { sql };
