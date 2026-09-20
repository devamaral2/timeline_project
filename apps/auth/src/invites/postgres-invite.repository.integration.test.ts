import { afterEach, expect, it } from "vitest";
import type { AuditEventInput } from "../audit/audit-event";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { PostgresInviteRepository } from "./postgres-invite.repository";

let fixture: PostgresTestDatabase | undefined;
let database: AuthDatabase | undefined;
afterEach(async () => {
  await database?.close(); database = undefined;
  await fixture?.close(); fixture = undefined;
});

const now = new Date("2026-09-05T12:00:00.000Z");
function audit(): AuditEventInput {
  return { correlationId: "test", actorUserId: "user", action: "invite.accepted", targetType: "invite", targetId: "invite", result: "succeeded", reason: null, metadata: { secondFactor: false }, context: { correlationId: "test", ipAddress: null, userAgent: "vitest" }, occurredAt: now };
}

describeWithPostgres("PostgresInviteRepository password-only acceptance", () => {
  it("activates exactly once without inventing a phone enrollment", async () => {
    fixture = await createPostgresTestDatabase();
    database = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    await database.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES('user','user@example.test','User','pending_invite',$1,$1)", [now]);
    await database.query("INSERT INTO invites(id,token_hash,user_id,expires_at,created_at) VALUES('invite','hash','user',$1,$2)", [new Date(now.getTime() + 60_000), now]);
    const repository = new PostgresInviteRepository(database);
    const command = { inviteId: "invite", userId: "user", passwordHash: "scrypt$hash", now, auditEvents: [audit()] };

    const [first, second] = await Promise.all([repository.acceptInvite(command), repository.acceptInvite(command)]);
    expect([first, second].sort()).toEqual(["accepted", "invalid"]);
    expect((await database.query("SELECT status,password_hash FROM users WHERE id='user'")).rows[0]).toEqual({
      status: "active",
      password_hash: "scrypt$hash",
    });
    expect((await database.query("SELECT accepted_at IS NOT NULL AS accepted FROM invites WHERE id='invite'")).rows[0]).toEqual({ accepted: true });
  });
});
