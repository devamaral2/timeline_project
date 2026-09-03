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
      for (const migration of ["0000_infrastructure.sql", "0001_users_invites.sql"]) {
        try { await client.query(await readFile(join(input.migrationsFolder, migration), "utf8")); }
        catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT" && migration !== "0000_infrastructure.sql") continue;
          throw error;
        }
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}
