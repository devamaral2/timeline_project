import { afterEach, expect, it } from "vitest";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { PostgresAuthenticationRepository } from "./postgres-authentication.repository";
import type { CompleteInviteEnrollmentCommand } from "./ports/authentication-repository";

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => { await db?.close(); db = undefined; await fixture?.close(); fixture = undefined; });

describeWithPostgres("PostgresAuthenticationRepository.completeInviteEnrollment", () => {
  it("commits exactly one concurrent invite enrollment and consumes sibling attempts", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-03T12:00:00.000Z");
    await db.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES('user','user@example.test','User','pending_invite',$1,$1)", [now]);
    await db.query("INSERT INTO invites(id,token_hash,user_id,expires_at,created_at) VALUES('invite','invite-token','user',$1,$2)", [new Date(now.getTime() + 60_000), now]);
    await db.query("INSERT INTO authentication_attempts(id,token_hash,user_id,purpose,second_factor,first_methods,invite_id,proposed_password_hash,proposed_phone_e164,proposed_mfa_channel,expires_at,created_at) VALUES('attempt','attempt-token','user','invite_acceptance','otp',ARRAY['pwd'],'invite','password-hash','+5511999999999','sms',$1,$2),('sibling','sibling-token','user','invite_acceptance','otp',ARRAY['pwd'],'invite','other-password','+5511888888888','sms',$1,$2)", [new Date(now.getTime() + 60_000), now]);
    await db.query("INSERT INTO mfa_challenges(id,attempt_id,requested_channel,reported_channel,provider_challenge_id,expires_at,created_at) VALUES('challenge','attempt','sms','sms','provider',$1,$2),('sibling-challenge','sibling','sms','sms','provider-2',$1,$2)", [new Date(now.getTime() + 60_000), now]);
    await db.query("INSERT INTO signing_keys(kid,public_jwk,encrypted_private_key,status,created_at) VALUES('key','{}','encrypted','active',$1)", [now]);
    const repository = new PostgresAuthenticationRepository(db);
    const command = (suffix: string): CompleteInviteEnrollmentCommand => ({ attemptTokenHash: "attempt-token", challengeId: "challenge", verifiedAt: now, context: { correlationId: "test", ipAddress: null, userAgent: null }, auditEvents: [], recoveryCodes: Array.from({ length: 10 }, (_, index) => ({ id: `${suffix}-code-${index}`, hash: `${suffix}-hash-${index}`, generation: 1, plainText: "AAAA-BBBB-CCCC-DDDD" })), newSession: { id: `${suffix}-session`, amr: ["pwd", "otp"], authTime: now, issuedAt: now, context: { correlationId: "test", ipAddress: null, userAgent: null }, refreshToken: { id: `${suffix}-refresh`, hash: `${suffix}-refresh-hash`, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } });
    const result = await Promise.all([repository.completeInviteEnrollment(command("a"), () => "access-a"), repository.completeInviteEnrollment(command("b"), () => "access-b")]);
    expect(result.filter((item) => item !== "invalid")).toHaveLength(1);
    expect((await db.query("SELECT status,password_hash,phone_e164 FROM users WHERE id='user'")).rows[0]).toEqual(expect.objectContaining({ status: "active", password_hash: "password-hash", phone_e164: "+5511999999999" }));
    expect((await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT count(*)::int AS count FROM recovery_codes WHERE generation=1")).rows[0]).toEqual({ count: 10 });
    expect((await db.query("SELECT invalidated_at FROM authentication_attempts WHERE id='sibling'")).rows[0].invalidated_at).not.toBeNull();
  });
});
