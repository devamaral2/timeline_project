import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { ulid } from "ulid";
import { migrateAuthDatabase } from "./src/db/migrate";
import { grantRuntimePrivileges } from "./src/testing/postgres-runtime-role";
import { createAuthDatabase, type AuthDatabase } from "./src/db/client";
import { createTestApp } from "./src/testing/create-test-app";
import { SigningKeyService } from "./src/crypto/signing-key.service";
import { ANONYMOUS_CONTEXT } from "./src/common/request-context";
import { hashSecretToken } from "./src/crypto/secret-token";
import { SECURITY_POLICY } from "./src/config/security-policy";
import { AUTH_DATABASE } from "./src/db/tokens";

function safe(value: string): string { if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test identifier"); return value; }

async function main() {
  const testUrl = process.env.AUTH_TEST_DATABASE_URL!;
  const suffix = ulid().toLowerCase(); const schema = safe(`auth_test_${suffix}`); const migrationsSchema = safe(`drizzle_auth_test_${suffix}`);
  const client = new Client({ connectionString: testUrl }); await client.connect();
  await migrateAuthDatabase({ migrationDatabaseUrl: testUrl, migrationsFolder: resolve(__dirname, "./drizzle"), migrationsSchema, schema });
  const role = safe(`auth_runtime_${randomBytes(10).toString("hex")}`); const password = randomBytes(24).toString("base64url");
  await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`); await grantRuntimePrivileges(client, schema, role);
  const url = new URL(testUrl); url.username = role; url.password = password; url.searchParams.set("options", `-c search_path=${schema}`);
  const runtimeUrl = url.toString();

  const app = await createTestApp({ AUTH_DATABASE_URL: runtimeUrl });
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const now = new Date();
  await app.app.get(SigningKeyService).ensureActive(now, {
    correlationId: "debug", actorUserId: null, action: "key.created", targetType: "signing_key", targetId: null,
    result: "succeeded", reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: now,
  });
  const userId = ulid();
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Seeded', 'hash', 'active', $3, $3)`,
    [userId, `${userId.toLowerCase()}@example.test`, now],
  );
  await db.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'admin')", [userId]);
  const sessionId = ulid(); const refreshToken = ulid();
  await db.query("INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, created_at) VALUES ($1, $2, ARRAY['pwd','otp'], $3, $3, $3)", [sessionId, userId, now]);
  await db.query("INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [ulid(), hashSecretToken(refreshToken), sessionId, new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000), now]);

  const response = await fetch(`${app.url}/auth/token/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken }) });
  console.log("status", response.status, await response.text());
  console.log("logger events", JSON.stringify(app.logger.events, null, 2));
  await app.close();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.query(`DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`); await client.query(`DROP ROLE IF EXISTS "${role}"`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
