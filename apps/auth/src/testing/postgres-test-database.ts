import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { ulid } from "ulid";
import { describe, inject } from "vitest";
import { migrateAuthDatabase } from "../db/migrate";
import { grantRuntimePrivileges } from "./postgres-runtime-role";

declare module "vitest" {
  interface ProvidedContext { authPostgresUrl: string }
}

const testUrl = inject("authPostgresUrl");
export const describeWithPostgres = describe;

export interface PostgresTestDatabase {
  migrationUrl: string;
  adminUrl: string;
  runtimeUrl: string;
  schema: string;
  close(): Promise<void>;
}

export async function createPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  if (!testUrl) throw new Error("Auth Testcontainers setup did not provide a database URL");
  const suffix = ulid().toLowerCase();
  const schema = `auth_test_${suffix}`;
  const migrationsSchema = `drizzle_auth_test_${suffix}`;
  const role = `auth_runtime_${randomBytes(10).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  async function cleanup(): Promise<void> {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.query(`DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`);
      await client.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
      await client.end();
    }
  }

  try {
    await migrateAuthDatabase({
      migrationDatabaseUrl: testUrl,
      migrationsFolder: resolve(__dirname, "../../drizzle"),
      migrationsSchema,
      schema,
    });
    await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await grantRuntimePrivileges(client, schema, role);
  } catch (error) {
    await cleanup();
    throw error;
  }

  const runtimeUrl = new URL(testUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  runtimeUrl.searchParams.set("options", `-c search_path=${schema}`);
  const adminUrl = new URL(testUrl);
  adminUrl.searchParams.set("options", `-c search_path=${schema}`);

  return {
    migrationUrl: testUrl,
    adminUrl: adminUrl.toString(),
    runtimeUrl: runtimeUrl.toString(),
    schema,
    close: cleanup,
  };
}
