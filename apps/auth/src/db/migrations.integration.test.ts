import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { migrateAuthDatabase } from "./migrate";
import { AUTH_SCHEMA_VERSION } from "./readiness";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const run = databaseUrl ? it : it.skip;
const migrationsFolder = resolve(process.cwd(), "apps/auth/drizzle");

let client: Client | undefined;
let schema: string | undefined;
afterEach(async () => {
  if (client && schema) {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "drizzle_${schema}" CASCADE`);
  }
  await client?.end();
  client = undefined;
  schema = undefined;
});

/** Migra um schema novo do zero e deixa o `search_path` apontando para ele. */
async function migratedSchema(): Promise<Client> {
  schema = `auth_test_migrations_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  await migrateAuthDatabase({ migrationDatabaseUrl: databaseUrl!, migrationsFolder, migrationsSchema: `drizzle_${schema}`, schema });
  await client.query(`SET search_path TO "${schema}"`);
  return client;
}

async function tables(db: Client): Promise<string[]> {
  return (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename", [schema])).rows.map((row) => row.tablename);
}

const insertUser = (db: Client, id: string, fields: Record<string, unknown>) => {
  const row = { email: null, name: id, password_hash: null, status: "active", phone: null, observes_user_id: null, ...fields };
  return db.query(
    "INSERT INTO users (id, email, name, password_hash, status, phone, observes_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())",
    [id, row.email, row.name, row.password_hash, row.status, row.phone, row.observes_user_id],
  );
};

describe("auth migrations", () => {
  run("apply from empty, are safe to repeat, and land on the current schema version", async () => {
    const db = await migratedSchema();
    await migrateAuthDatabase({ migrationDatabaseUrl: databaseUrl!, migrationsFolder, migrationsSchema: `drizzle_${schema}`, schema });

    expect((await db.query("SELECT version FROM auth_schema_meta")).rows).toEqual([{ version: AUTH_SCHEMA_VERSION }]);
    expect(await tables(db)).toEqual(expect.arrayContaining([
      "auth_schema_meta", "rate_limit_buckets", "refresh_tokens", "role_permissions", "roles",
      "sessions", "signing_keys", "signup_tokens", "user_permissions", "user_roles", "users",
    ]));
    for (const dropped of ["invites", "audit_log", "authentication_attempts", "mfa_challenges", "recovery_codes"]) {
      expect(await tables(db)).not.toContain(dropped);
    }
    // As quatro tabelas de RBAC continuam.
    expect(await tables(db)).toEqual(expect.arrayContaining(["roles", "role_permissions", "user_roles", "user_permissions"]));
    expect((await db.query("SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'reject_audit_mutation' AND n.nspname = $1", [schema])).rows[0]).toEqual({ count: 0 });
  });

  run("accepts exactly the four status values", async () => {
    const db = await migratedSchema();
    await insertUser(db, "active", { email: "a@example.test", password_hash: "hash", phone: "+5511999990000" });
    await insertUser(db, "inactive", { status: "inactive", email: "i@example.test" });
    await insertUser(db, "pending", { status: "pending_sign_up", name: "admin_ab12cd" });
    await insertUser(db, "guest", { status: "guest", name: "guest_ab12cd", observes_user_id: "active" });

    for (const status of ["pending_invite", "suspended", "disabled", "admin"]) {
      await expect(insertUser(db, `bad-${status}`, { status, email: `${status}@example.test`, password_hash: "hash" })).rejects.toThrow(/users_status_check/);
    }
  });

  run("lets placeholders and guests exist without email or phone, and keeps both unique when present", async () => {
    const db = await migratedSchema();
    await insertUser(db, "p1", { status: "pending_sign_up" });
    await insertUser(db, "p2", { status: "pending_sign_up" });
    await insertUser(db, "u1", { email: "same@example.test", phone: "+5511999990001", password_hash: "hash" });

    await expect(insertUser(db, "u2", { email: "same@example.test", password_hash: "hash" })).rejects.toThrow(/unique/i);
    await expect(insertUser(db, "u3", { email: "other@example.test", phone: "+5511999990001", password_hash: "hash" })).rejects.toThrow(/users_phone_unique/);
    await expect(insertUser(db, "u4", { email: "fone@example.test", phone: "11 99999-0001", password_hash: "hash" })).rejects.toThrow(/users_phone_e164/);
  });

  run("keeps credentials off guests and binds every guest, and only guests, to an observed user", async () => {
    const db = await migratedSchema();
    await insertUser(db, "owner", { email: "owner@example.test", password_hash: "hash" });

    await expect(insertUser(db, "g1", { status: "guest", observes_user_id: "owner", password_hash: "hash" })).rejects.toThrow(/users_guest_has_no_credentials/);
    await expect(insertUser(db, "g2", { status: "guest", observes_user_id: "owner", email: "g@example.test" })).rejects.toThrow(/users_guest_has_no_credentials/);
    await expect(insertUser(db, "g3", { status: "guest" })).rejects.toThrow(/users_guest_observes_someone/);
    await expect(insertUser(db, "g4", { status: "guest", observes_user_id: "g4" })).rejects.toThrow();
    await expect(insertUser(db, "u1", { email: "u1@example.test", password_hash: "hash", observes_user_id: "owner" })).rejects.toThrow(/users_only_guests_observe/);
    await expect(insertUser(db, "g5", { status: "guest", observes_user_id: "nobody" })).rejects.toThrow(/foreign key/);
  });

  run("an active user still needs a password — the old MFA phone requirement is gone", async () => {
    const db = await migratedSchema();
    await expect(insertUser(db, "no-pass", { email: "np@example.test" })).rejects.toThrow(/users_active_requires_password/);
    await insertUser(db, "no-phone", { email: "nf@example.test", password_hash: "hash" });

    const definitions = (await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'users'::regclass")).rows.map((row) => row.def as string);
    expect(definitions.join("\n")).not.toMatch(/phone_verified_at|mfa_channel/);
  });

  run("seeds admin and guest only, and deleting a guest cascades its roles and tokens", async () => {
    const db = await migratedSchema();
    expect((await db.query("SELECT key FROM roles ORDER BY key")).rows.map((row) => row.key)).toEqual(["admin", "guest"]);
    expect((await db.query("SELECT role_key, permission FROM role_permissions ORDER BY role_key, permission")).rows).toEqual([
      { role_key: "admin", permission: "*:manage" },
      { role_key: "guest", permission: "event:read" },
      { role_key: "guest", permission: "tag:read" },
    ]);

    await insertUser(db, "owner", { email: "owner@example.test", password_hash: "hash" });
    await insertUser(db, "guest", { status: "guest", observes_user_id: "owner" });
    await db.query("INSERT INTO user_roles (user_id, role_key) VALUES ('guest', 'guest')");
    await db.query("INSERT INTO user_permissions (user_id, permission, effect) VALUES ('guest', 'tag:read', 'deny')");
    await db.query("DELETE FROM users WHERE id = 'guest'");
    expect((await db.query("SELECT count(*)::int AS count FROM user_roles")).rows[0]).toEqual({ count: 0 });
    expect((await db.query("SELECT count(*)::int AS count FROM user_permissions")).rows[0]).toEqual({ count: 0 });

    // Apagar o observado leva os guests dele junto.
    await insertUser(db, "guest-2", { status: "guest", observes_user_id: "owner" });
    await db.query("DELETE FROM users WHERE id = 'owner'");
    expect((await db.query("SELECT count(*)::int AS count FROM users")).rows[0]).toEqual({ count: 0 });
  });

  run("stores one open signup token per user, keyed by a unique jti", async () => {
    const db = await migratedSchema();
    await insertUser(db, "pending", { status: "pending_sign_up" });
    const insertToken = (id: string, jti: string) => db.query("INSERT INTO signup_tokens (id, jti, user_id, expires_at, created_at) VALUES ($1, $2, 'pending', now() + interval '1 hour', now())", [id, jti]);

    await insertToken("t1", "jti-1");
    await expect(insertToken("t2", "jti-2")).rejects.toThrow(/signup_tokens_one_open_per_user/);
    await db.query("UPDATE signup_tokens SET revoked_at = now() WHERE id = 't1'");
    await expect(insertToken("t3", "jti-1")).rejects.toThrow(/signup_tokens_jti_unique/);
    await insertToken("t4", "jti-4");
    await expect(db.query("UPDATE signup_tokens SET consumed_at = now() WHERE id = 't1'")).rejects.toThrow(/signup_tokens_single_outcome/);
  });

  run("limits rate-limit scopes to login, signup and guest issuance", async () => {
    const db = await migratedSchema();
    const insertBucket = (scope: string) => db.query("INSERT INTO rate_limit_buckets (scope, subject_hash, window_started_at, window_expires_at, hit_count, updated_at) VALUES ($1, 'h', now(), now(), 1, now())", [scope]);
    for (const scope of ["login_email", "login_ip", "signup_ip", "guest_issuer"]) await insertBucket(scope);
    await expect(insertBucket("mfa_send_user")).rejects.toThrow(/rate_limit_buckets_scope_check/);
  });

  run("rolls 0006 back to the audit/MFA tables and forward again", async () => {
    const db = await migratedSchema();
    await db.query("BEGIN");
    await db.query(readFileSync(resolve(migrationsFolder, "rollback/0006_drop_audit_and_mfa.down.sql"), "utf8"));
    await db.query("COMMIT");
    expect((await db.query("SELECT version FROM auth_schema_meta")).rows).toEqual([{ version: 6 }]);
    expect(await tables(db)).toEqual(expect.arrayContaining(["audit_log", "authentication_attempts", "mfa_challenges", "recovery_codes"]));
    await db.query("INSERT INTO audit_log (id, correlation_id, action, result, created_at) VALUES ('a', 'c', 'x', 'succeeded', now())");
    await expect(db.query("UPDATE audit_log SET action = 'y'")).rejects.toThrow(/append-only/);

    await db.query("BEGIN");
    await db.query(readFileSync(resolve(migrationsFolder, "0006_drop_audit_and_mfa.sql"), "utf8"));
    await db.query("COMMIT");
    expect((await db.query("SELECT version FROM auth_schema_meta")).rows).toEqual([{ version: 7 }]);
    expect(await tables(db)).not.toContain("audit_log");
  });

  run("rolls 0005 back to the invite schema and forward again", async () => {
    const db = await migratedSchema();
    await db.query("BEGIN");
    await db.query(readFileSync(resolve(migrationsFolder, "rollback/0006_drop_audit_and_mfa.down.sql"), "utf8"));
    await db.query("COMMIT");
    await db.query("BEGIN");
    await db.query(readFileSync(resolve(migrationsFolder, "rollback/0005_identity_vocabulary.down.sql"), "utf8"));
    await db.query("COMMIT");
    expect((await db.query("SELECT version FROM auth_schema_meta")).rows).toEqual([{ version: 5 }]);
    expect(await tables(db)).toContain("invites");
    expect((await db.query("SELECT key FROM roles ORDER BY key")).rows.map((row) => row.key)).toEqual(["admin", "member", "viewer"]);

    await db.query("BEGIN");
    await db.query(readFileSync(resolve(migrationsFolder, "0005_identity_vocabulary.sql"), "utf8"));
    await db.query("COMMIT");
    expect((await db.query("SELECT version FROM auth_schema_meta")).rows).toEqual([{ version: 6 }]);
    expect(await tables(db)).toContain("signup_tokens");
  });

  it("ships a disposable Postgres compose definition", () => {
    expect(existsSync(resolve(__dirname, "../../compose.test.yaml"))).toBe(true);
  });
});
