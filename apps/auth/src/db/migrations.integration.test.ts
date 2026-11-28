import { DatabaseSync, loadMigrations, migrateDatabase } from "@repo/sqlite";
import { afterEach, expect, it } from "vitest";
import { AUTH_MIGRATIONS_DIR } from "./client";
import { AUTH_SCHEMA_VERSION } from "./readiness";
import { createAuthTestDatabase, type AuthTestDatabase } from "../testing/sqlite-test-database";

let fixture: AuthTestDatabase | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

it("applies every migration, is safe to repeat, and leaves the version the code expects", async () => {
  const migrations = loadMigrations(AUTH_MIGRATIONS_DIR);
  const db = new DatabaseSync(":memory:");
  expect(migrateDatabase(db, { migrations })).toEqual(migrations.map((migration) => migration.name));
  // Repetir a migracao e parte do runbook: a segunda execucao e um no-op.
  expect(migrateDatabase(db, { migrations })).toEqual([]);
  expect(db.prepare("SELECT version FROM auth_schema_meta").all()).toEqual([{ version: AUTH_SCHEMA_VERSION }]);
  const tables = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
  expect(tables).toEqual(expect.arrayContaining([
    "audit_log", "auth_schema_meta", "device_keys", "invites",
    "rate_limit_buckets", "refresh_tokens", "role_permissions", "roles",
    "sessions", "signing_keys", "user_permissions", "user_roles", "users",
  ]));
  expect(tables).not.toEqual(expect.arrayContaining(["authentication_attempts", "mfa_challenges", "recovery_codes"]));
});

// O nome antigo do recurso: este arquivo esta na lista de excecoes da varredura de residuos (test/residuos/varredura.ts).
const OLD = "event";

it("seeds the system roles with task permissions and refuses the old names and unknown ones", async () => {
  fixture = await createAuthTestDatabase();
  const db = fixture.open();
  const roles = await db.query<{ role_key: string; permission: string }>(
    "SELECT role_key, permission FROM role_permissions ORDER BY role_key, permission",
  );
  expect(roles.rows.map((row) => `${row.role_key}/${row.permission}`)).toEqual([
    "admin/*:manage",
    "member/tag:create", "member/tag:read", "member/task:create", "member/task:delete", "member/task:read", "member/task:update",
    "viewer/tag:read", "viewer/task:read",
  ]);
  await db.query("INSERT INTO users (id, email, name, status, created_at, updated_at) VALUES ('user-1', 'u1@example.com', 'U1', 'pending_invite', $1, $1)", [new Date()]);
  await expect(db.query(`INSERT INTO role_permissions (role_key, permission) VALUES ('member', '${OLD}:read')`)).rejects.toThrow(/CHECK/);
  await expect(db.query(`INSERT INTO user_permissions (user_id, permission, effect) VALUES ('user-1', '${OLD}:read', 'allow')`)).rejects.toThrow(/CHECK/);
  await expect(db.query("INSERT INTO user_permissions (user_id, permission, effect) VALUES ('user-1', 'task:fly', 'allow')")).rejects.toThrow(/CHECK/);
  await db.query("INSERT INTO user_permissions (user_id, permission, effect) VALUES ('user-1', 'grant:manage', 'deny')");
});

it("rejects an unknown authentication method and a refresh token that is not valid for exactly 30 days", async () => {
  fixture = await createAuthTestDatabase();
  const db = fixture.open();
  const at = new Date("2026-09-01T00:00:00.000Z");
  await db.query("INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES ('u', 'u@example.com', 'U', 'h', 'active', $1, $1)", [at]);
  const session = "INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, created_at) VALUES ($1, 'u', $2, $3, $3, $3)";
  await expect(db.query(session, ["s0", ["pwd", "sms"], at])).rejects.toThrow(/unknown authentication method/);
  await expect(db.query(session, ["s0", [], at])).rejects.toThrow(/CHECK/);
  await db.query(session, ["s1", ["pwd"], at]);
  const token = "INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, 's1', $3, $4)";
  await expect(db.query(token, ["r0", "h0", new Date(at.getTime() + 29 * 86_400_000), at])).rejects.toThrow(/CHECK/);
  await db.query(token, ["r1", "h1", new Date(at.getTime() + 30 * 86_400_000), at]);
  const row = (await db.query("SELECT amr, auth_time FROM sessions WHERE id = 's1'")).rows[0];
  expect(row).toEqual({ amr: ["pwd"], auth_time: at });
});
