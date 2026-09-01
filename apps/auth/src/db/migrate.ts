import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe PostgreSQL identifier");
  return `"${value}"`;
}

export async function migrateAuthDatabase(input: {
  migrationDatabaseUrl: string;
  migrationsFolder: string;
  migrationsSchema?: string;
  schema?: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: input.migrationDatabaseUrl, max: 1 });
  try {
    const schema = input.schema ?? "public";
    const migrationsSchema = input.migrationsSchema ?? "drizzle";
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(migrationsSchema)}`);
      await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
      await client.query(await readFile(join(input.migrationsFolder, "0000_infrastructure.sql"), "utf8"));
    } finally { client.release(); }
  } finally { await pool.end(); }
}
