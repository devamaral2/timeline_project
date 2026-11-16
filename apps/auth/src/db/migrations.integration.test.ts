import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { expect, it, inject } from "vitest";
import { migrateAuthDatabase } from "./migrate";
import { AUTH_SCHEMA_VERSION } from "./readiness";

const databaseUrl = inject("authPostgresUrl");

it("applies every migration, is safe to repeat, and keeps audit_log append-only", async () => {
  const schema = `auth_test_migrations_${Date.now()}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    await migrateAuthDatabase({
      migrationDatabaseUrl: databaseUrl,
      migrationsFolder: resolve(process.cwd(), "apps/auth/drizzle"),
      migrationsSchema: `drizzle_${schema}`,
      schema,
    });
    // Repetir a migracao e parte do runbook: o operador nao sabe de cor o que
    // ja foi aplicado, e a segunda execucao precisa ser um no-op.
    await migrateAuthDatabase({
      migrationDatabaseUrl: databaseUrl,
      migrationsFolder: resolve(process.cwd(), "apps/auth/drizzle"),
      migrationsSchema: `drizzle_${schema}`,
      schema,
    });
    const version = await client.query(`SELECT version FROM "${schema}".auth_schema_meta`);
    expect(version.rows).toEqual([{ version: AUTH_SCHEMA_VERSION }]);
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
      [schema],
    );
    expect(tables.rows.map((row) => row.tablename)).toEqual(expect.arrayContaining([
      "audit_log", "auth_schema_meta", "invites",
      "rate_limit_buckets", "refresh_tokens", "role_permissions", "roles",
      "sessions", "signing_keys", "user_permissions", "user_roles", "users",
    ]));
    expect(tables.rows.map((row) => row.tablename)).not.toEqual(expect.arrayContaining([
      "authentication_attempts", "mfa_challenges", "recovery_codes",
    ]));
    await client.query(`INSERT INTO "${schema}".audit_log (id, correlation_id, action, result, created_at) VALUES ('audit-1', 'correlation', 'login.failed', 'failed', now())`);
    await expect(client.query(`UPDATE "${schema}".audit_log SET action = 'login.failed'`)).rejects.toThrow();
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

// O nome antigo do recurso: este arquivo esta na lista de excecoes da varredura de residuos (test/residuos/varredura.ts).
const OLD = "event";

it("rewrites the old permission names to task:* and rejects them afterwards", async () => {
  const schema = `auth_test_task_permissions_${Date.now()}`;
  const full = resolve(process.cwd(), "apps/auth/drizzle");
  const before = await mkdtemp(join(tmpdir(), "auth-migrations-"));
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    for (const name of (await readdir(full)).filter((file) => /^\d{4}_.*\.sql$/.test(file) && file < "0010")) {
      await copyFile(join(full, name), join(before, name));
    }
    const options = { migrationDatabaseUrl: databaseUrl, migrationsSchema: `drizzle_${schema}`, schema };
    await migrateAuthDatabase({ ...options, migrationsFolder: before });

    await client.query(`INSERT INTO "${schema}".users (id, email, name, status, created_at, updated_at) VALUES ('user-1', 'u1@example.com', 'U1', 'pending_invite', now(), now())`);
    await client.query(`INSERT INTO "${schema}".roles (key, name, description, is_system, created_at) VALUES ('custom', 'Custom', 'x', false, now())`);
    await client.query(`INSERT INTO "${schema}".role_permissions (role_key, permission) VALUES ('custom', '${OLD}:read'), ('custom', '${OLD}:manage'), ('custom', 'tag:read')`);
    await client.query(`INSERT INTO "${schema}".user_permissions (user_id, permission, effect) VALUES ('user-1', '${OLD}:delete', 'deny'), ('user-1', '${OLD}:update', 'allow')`);

    await migrateAuthDatabase({ ...options, migrationsFolder: full });

    const roles = await client.query(`SELECT role_key, permission FROM "${schema}".role_permissions WHERE role_key IN ('member', 'viewer', 'custom') ORDER BY role_key, permission`);
    expect(roles.rows.map((row) => `${row.role_key}/${row.permission}`)).toEqual([
      "custom/tag:read", "custom/task:manage", "custom/task:read",
      "member/tag:create", "member/tag:read", "member/task:create", "member/task:delete", "member/task:read", "member/task:update",
      "viewer/tag:read", "viewer/task:read",
    ]);
    const direct = await client.query(`SELECT permission, effect FROM "${schema}".user_permissions ORDER BY permission`);
    expect(direct.rows).toEqual([{ permission: "task:delete", effect: "deny" }, { permission: "task:update", effect: "allow" }]);

    await expect(client.query(`INSERT INTO "${schema}".role_permissions (role_key, permission) VALUES ('custom', '${OLD}:read')`)).rejects.toThrow();
    await expect(client.query(`INSERT INTO "${schema}".user_permissions (user_id, permission, effect) VALUES ('user-1', '${OLD}:read', 'allow')`)).rejects.toThrow();
    await client.query(`INSERT INTO "${schema}".role_permissions (role_key, permission) VALUES ('custom', 'task:create')`);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
    await rm(before, { recursive: true, force: true });
  }
});
