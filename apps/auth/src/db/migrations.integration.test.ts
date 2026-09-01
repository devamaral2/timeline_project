import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, expect, it } from "vitest";
import { migrateAuthDatabase } from "./migrate";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const run = databaseUrl ? it : it.skip;

run("migrates an empty schema once and records infrastructure version", async () => {
  const schema = `auth_test_migrations_${Date.now()}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    await migrateAuthDatabase({
      migrationDatabaseUrl: databaseUrl!,
      migrationsFolder: resolve(process.cwd(), "apps/auth/drizzle"),
      migrationsSchema: `drizzle_${schema}`,
      schema,
    });
    const version = await client.query(`SELECT version FROM "${schema}".auth_schema_meta`);
    expect(version.rows).toEqual([{ version: 1 }]);
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
      [schema],
    );
    expect(tables.rows.map((row) => row.tablename)).toEqual(expect.arrayContaining([
      "audit_log", "auth_schema_meta", "rate_limit_buckets", "signing_keys",
    ]));
    await client.query(`INSERT INTO "${schema}".audit_log (id, correlation_id, action, result, created_at) VALUES ('audit-1', 'correlation', 'login.failed', 'failed', now())`);
    await expect(client.query(`UPDATE "${schema}".audit_log SET action = 'login.failed'`)).rejects.toThrow();
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

it("ships a disposable Postgres compose definition", () => {
  expect(existsSync(resolve(__dirname, "../../compose.test.yaml"))).toBe(true);
});
