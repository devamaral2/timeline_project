import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { ulid } from "ulid";
import { describe } from "vitest";
import { migrateAuthDatabase } from "../db/migrate";
import { grantRuntimePrivileges } from "./postgres-runtime-role";

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
if (process.env.AUTH_REQUIRE_POSTGRES_TESTS === "true" && !testUrl) throw new Error("AUTH_TEST_DATABASE_URL is required when AUTH_REQUIRE_POSTGRES_TESTS=true");
export const describeWithPostgres = testUrl ? describe : describe.skip;
function safe(value: string): string { if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test identifier"); return value; }
export interface PostgresTestDatabase { migrationUrl: string; runtimeUrl: string; schema: string; close(): Promise<void>; }
export async function createPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  if (!testUrl) throw new Error("AUTH_TEST_DATABASE_URL is not configured");
  const suffix = ulid().toLowerCase(); const schema = safe(`auth_test_${suffix}`); const migrationsSchema = safe(`drizzle_auth_test_${suffix}`);
  const client = new Client({ connectionString: testUrl }); await client.connect();
  await migrateAuthDatabase({ migrationDatabaseUrl: testUrl, migrationsFolder: resolve(__dirname, "../../drizzle"), migrationsSchema, schema });
  const role = safe(`auth_runtime_${randomBytes(10).toString("hex")}`); const password = randomBytes(24).toString("base64url");
  await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`); await grantRuntimePrivileges(client, schema, role);
  const url = new URL(testUrl); url.username = role; url.password = password; url.searchParams.set("options", `-c search_path=${schema}`);
  return { migrationUrl: testUrl, runtimeUrl: url.toString(), schema, async close() { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.query(`DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`); await client.query(`DROP ROLE IF EXISTS "${role}"`); await client.end(); } };
}
