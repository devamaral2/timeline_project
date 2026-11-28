import { afterEach, expect, it } from "vitest";
import { createAuthTestDatabase, type AuthTestDatabase } from "../testing/sqlite-test-database";
import { COPIED_TABLES, CopyRefusedError, copyAuthDataFromPostgres, type CopySource } from "./copy-from-postgres";

let fixture: AuthTestDatabase | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

const at = new Date("2026-05-01T12:00:00.000Z");
const jwk = { kty: "OKP", crv: "Ed25519", x: "x", kid: "kid-1", use: "sig", alg: "EdDSA" };

/** O que o `pg` devolveria do banco antigo: Date, objeto do jsonb, lista do text[], texto do inet. */
const postgres: Record<string, Record<string, unknown>[]> = {
  users: [{ id: "u1", email: "dono@example.test", name: "Dono", password_hash: "scrypt$x", status: "active", created_at: at, updated_at: at }],
  roles: [
    { key: "admin", name: "Administrador", description: "Gerencia.", is_system: true, created_at: at },
    { key: "custom", name: "Custom", description: "x", is_system: false, created_at: at },
  ],
  role_permissions: [{ role_key: "admin", permission: "*:manage" }, { role_key: "custom", permission: "task:read" }],
  user_roles: [{ user_id: "u1", role_key: "admin" }],
  user_permissions: [{ user_id: "u1", permission: "grant:manage", effect: "deny" }],
  device_keys: [{ id: "dk1", user_id: "u1", label: "pc", permission: "transcription:work", key_hash: "h", created_at: at, last_used_at: null, revoked_at: null }],
  signing_keys: [{ kid: "kid-1", status: "active", public_jwk: jwk, encrypted_private_key: "ciphertext", created_at: at, last_used_at: at, retire_after: null, retired_at: null }],
  audit_log: [{ id: "a1", correlation_id: "c", actor_user_id: "u1", action: "login.succeeded", target_type: "session", target_id: "s", result: "succeeded", reason: null, metadata: { amr: ["pwd"] }, ip_address: "203.0.113.7", user_agent: "ua", created_at: at }],
};

const source: CopySource = {
  async query(text) {
    const table = /FROM (\w+)/.exec(text)?.[1] ?? "";
    return { rows: postgres[table] ?? [] };
  },
};

it("copies access data in foreign-key order, with types the repositories read back", async () => {
  fixture = await createAuthTestDatabase();
  const db = fixture.open();
  // A chave que o auth cria ao subir num banco vazio, antes da copia.
  await db.query(
    "INSERT INTO signing_keys (kid, status, public_jwk, encrypted_private_key, created_at) VALUES ('boot', 'active', $1, 'c', $2)",
    [{ ...jwk, kid: "boot" }, at],
  );

  const { copied } = await copyAuthDataFromPostgres(source, db);

  expect(Object.keys(copied)).toEqual(COPIED_TABLES.map((spec) => spec.table));
  expect(copied).toMatchObject({ users: 1, roles: 2, role_permissions: 2, device_keys: 1, signing_keys: 1, audit_log: 1 });
  expect((await db.query("SELECT * FROM users")).rows).toEqual(postgres.users);
  expect((await db.query("SELECT key, is_system FROM roles ORDER BY key")).rows).toEqual([
    { key: "admin", is_system: true }, { key: "custom", is_system: false },
    { key: "member", is_system: true }, { key: "viewer", is_system: true },
  ]);
  // As permissoes dos papeis passam a ser as do banco antigo.
  expect((await db.query("SELECT role_key, permission FROM role_permissions ORDER BY 1, 2")).rows).toEqual(postgres.role_permissions);
  expect((await db.query("SELECT kid, public_jwk, created_at FROM signing_keys")).rows).toEqual([{ kid: "kid-1", public_jwk: jwk, created_at: at }]);
  expect((await db.query("SELECT metadata, ip_address FROM audit_log")).rows).toEqual([{ metadata: { amr: ["pwd"] }, ip_address: "203.0.113.7" }]);
});

it("refuses a SQLite database that already has users and writes nothing", async () => {
  fixture = await createAuthTestDatabase();
  const db = fixture.open();
  await db.query("INSERT INTO users (id, email, name, status, created_at, updated_at) VALUES ('x', 'x@example.test', 'X', 'pending_invite', $1, $1)", [at]);

  await expect(copyAuthDataFromPostgres(source, db)).rejects.toThrow(CopyRefusedError);
  expect((await db.query("SELECT count(*) AS n FROM role_permissions")).rows).toEqual([{ n: 9 }]);
  expect((await db.query("SELECT count(*) AS n FROM audit_log")).rows).toEqual([{ n: 0 }]);
});
