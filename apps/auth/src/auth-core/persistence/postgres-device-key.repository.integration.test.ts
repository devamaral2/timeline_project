import { afterEach, expect, it } from "vitest";
import type { AuthDatabase } from "../../db/client";
import { createAuthTestDatabase, describeWithDatabase, type AuthTestDatabase } from "../../testing/sqlite-test-database";
import { PostgresDeviceKeyRepository } from "./postgres-device-key.repository";

let fixture: AuthTestDatabase | undefined;
let database: AuthDatabase | undefined;
afterEach(async () => {
  await database?.close(); database = undefined;
  await fixture?.close(); fixture = undefined;
});

const now = new Date("2026-11-26T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: null, userAgent: null };

async function setup() {
  fixture = await createAuthTestDatabase();
  database = fixture.open();
  await database.query("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES('user','user@example.test','User','scrypt$hash','active',$1,$1)", [now]);
  return { db: database, repository: new PostgresDeviceKeyRepository(database) };
}
const issue = (id: string, keyHash: string) => ({ id, userId: "user", label: "pc", keyHash, permission: "transcription:work" as const, now, context });

describeWithDatabase("PostgresDeviceKeyRepository", () => {
  it("authenticates a valid key, then refuses it once revoked, and audits both without the key", async () => {
    const { db, repository } = await setup();
    await repository.issue(issue("key-1", "hash-1"));

    await expect(repository.authenticate({ keyHash: "hash-1", now })).resolves.toEqual({ keyId: "key-1", userId: "user", permission: "transcription:work" });
    await expect(repository.authenticate({ keyHash: "hash-desconhecido", now })).resolves.toBeNull();

    await expect(repository.revoke({ id: "key-1", now, context })).resolves.toBe("revoked");
    await expect(repository.authenticate({ keyHash: "hash-1", now })).resolves.toBeNull();
    await expect(repository.revoke({ id: "key-1", now, context })).resolves.toBe("already_revoked");
    await expect(repository.revoke({ id: "nope", now, context })).resolves.toBe("not_found");

    const audit = await db.query<{ action: string }>("SELECT action FROM audit_log WHERE target_id='key-1'");
    expect(audit.rows.map((row) => row.action).sort()).toEqual(["device_key.issued", "device_key.revoked"]);
  });

  it("refuses a key whose owner is no longer active, and records when it was last used", async () => {
    const { db, repository } = await setup();
    await repository.issue(issue("key-1", "hash-1"));
    await repository.authenticate({ keyHash: "hash-1", now });
    expect((await db.query("SELECT last_used_at FROM device_keys WHERE id='key-1'")).rows[0]).toEqual({ last_used_at: now });

    await db.query("UPDATE users SET status='suspended' WHERE id='user'");
    await expect(repository.authenticate({ keyHash: "hash-1", now })).resolves.toBeNull();
  });

  it("accepts nothing but the transcription permission", async () => {
    const { db } = await setup();
    await expect(db.query("INSERT INTO device_keys(id,user_id,label,permission,key_hash,created_at) VALUES('k','user','x','task:manage','h',$1)", [now])).rejects.toThrow();
  });
});
