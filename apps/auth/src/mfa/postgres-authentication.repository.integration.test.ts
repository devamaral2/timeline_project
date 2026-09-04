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
    const repository = new PostgresAuthenticationRepository(db, "https://auth.example.test", "timeline-api");
    const command = (suffix: string): CompleteInviteEnrollmentCommand => ({ attemptTokenHash: "attempt-token", challengeId: "challenge", verifiedAt: now, context: { correlationId: "test", ipAddress: null, userAgent: null }, auditEvents: [], recoveryCodes: Array.from({ length: 10 }, (_, index) => ({ id: `${suffix}-code-${index}`, hash: `${suffix}-hash-${index}`, generation: 1, plainText: "AAAA-BBBB-CCCC-DDDD" })), newSession: { id: `${suffix}-session`, amr: ["pwd", "otp"], authTime: now, issuedAt: now, context: { correlationId: "test", ipAddress: null, userAgent: null }, refreshToken: { id: `${suffix}-refresh`, hash: `${suffix}-refresh-hash`, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } });
    const result = await Promise.all([repository.completeInviteEnrollment(command("a"), () => "access-a"), repository.completeInviteEnrollment(command("b"), () => "access-b")]);
    expect(result.filter((item) => item !== "invalid")).toHaveLength(1);
    expect((await db.query("SELECT status,password_hash,phone_e164 FROM users WHERE id='user'")).rows[0]).toEqual(expect.objectContaining({ status: "active", password_hash: "password-hash", phone_e164: "+5511999999999" }));
    expect((await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT count(*)::int AS count FROM recovery_codes WHERE generation=1")).rows[0]).toEqual({ count: 10 });
    expect((await db.query("SELECT invalidated_at FROM authentication_attempts WHERE id='sibling'")).rows[0].invalidated_at).not.toBeNull();
  });
});

async function seedVerifiedStepUp(database: AuthDatabase, now: Date, purpose: "password_change" | "recovery_regeneration", secondFactor: "otp" | "recovery"): Promise<void> {
  await database.query("INSERT INTO users(id,email,name,password_hash,phone_e164,phone_verified_at,mfa_channel,status,created_at,updated_at) VALUES('user','user@example.test','User','old-hash','+5511999999999',$1,'sms','active',$1,$1)", [now]);
  await database.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,created_at) VALUES('origin','user',ARRAY['pwd','otp'],$1,$1,$1),('other','user',ARRAY['pwd','otp'],$1,$1,$1)", [now]);
  await database.query("INSERT INTO authentication_attempts(id,token_hash,user_id,purpose,second_factor,first_methods,origin_session_id,verified_at,expires_at,created_at) VALUES('step-up','step-up-token','user',$1,$2,ARRAY['pwd','otp'],'origin',$3,$4,$3)", [purpose, secondFactor, now, new Date(now.getTime() + 60_000)]);
  await database.query("INSERT INTO signing_keys(kid,public_jwk,encrypted_private_key,status,created_at) VALUES('key','{}','encrypted','active',$1)", [now]);
}

describeWithPostgres("PostgresAuthenticationRepository step-up commits", () => {
  it("consumes a verified step-up exactly once under two concurrent password changes", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T12:00:00.000Z");
    await seedVerifiedStepUp(db, now, "password_change", "otp");
    const repository = new PostgresAuthenticationRepository(db, "https://auth.example.test", "timeline-api");
    const command = (suffix: string) => ({ attemptTokenHash: "step-up-token", userId: "user", originSessionId: "origin", passwordHash: `${suffix}-hash`, now, auditEvents: [], newSession: { id: `${suffix}-session`, amr: ["pwd", "otp"] as const, authTime: now, issuedAt: now, context: { correlationId: "test", ipAddress: null, userAgent: null }, refreshToken: { id: `${suffix}-refresh`, hash: `${suffix}-refresh-hash`, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } });

    const results = await Promise.all([repository.changePasswordWithStepUp(command("a"), () => "access-a"), repository.changePasswordWithStepUp(command("b"), () => "access-b")]);

    expect(results.filter((item) => item !== "invalid")).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS count FROM sessions WHERE revoked_at IS NULL")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT consumed_at FROM authentication_attempts WHERE id='step-up'")).rows[0].consumed_at).not.toBeNull();
    expect((await db.query("SELECT password_hash FROM users WHERE id='user'")).rows[0].password_hash).toMatch(/^(a|b)-hash$/);
  });

  it("emits a single new recovery generation under two concurrent regenerations", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T12:00:00.000Z");
    await seedVerifiedStepUp(db, now, "recovery_regeneration", "recovery");
    await db.query("INSERT INTO recovery_codes(id,user_id,code_hash,generation,created_at) VALUES('old','user','old-hash',1,$1)", [now]);
    const repository = new PostgresAuthenticationRepository(db, "https://auth.example.test", "timeline-api");
    const command = (suffix: string) => ({ attemptTokenHash: "step-up-token", userId: "user", originSessionId: "origin", now, auditEvents: [], recoveryCodes: Array.from({ length: 10 }, (_, index) => ({ id: `${suffix}-code-${index}`, hash: `${suffix}-hash-${index}`, generation: 1, plainText: "AAAA-BBBB-CCCC-DDDD" })) });

    const results = await Promise.all([repository.regenerateRecoveryCodesWithStepUp(command("a")), repository.regenerateRecoveryCodesWithStepUp(command("b"))]);

    expect(results.filter((item) => item === "regenerated")).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS count FROM recovery_codes WHERE generation=2")).rows[0]).toEqual({ count: 10 });
    expect((await db.query("SELECT revoked_at FROM recovery_codes WHERE id='old'")).rows[0].revoked_at).not.toBeNull();
    // Regenerar nao encosta em sessao.
    expect((await db.query("SELECT count(*)::int AS count FROM sessions WHERE revoked_at IS NULL")).rows[0]).toEqual({ count: 2 });
  });

  it("burns a recovery code once when two verifications race", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T12:00:00.000Z");
    await seedVerifiedStepUp(db, now, "recovery_regeneration", "recovery");
    await db.query("UPDATE authentication_attempts SET verified_at=NULL WHERE id='step-up'");
    await db.query("INSERT INTO recovery_codes(id,user_id,code_hash,generation,created_at) VALUES('code','user','recovery-hash',1,$1)", [now]);
    const repository = new PostgresAuthenticationRepository(db, "https://auth.example.test", "timeline-api");
    const command = { attemptTokenHash: "step-up-token", recoveryCodeHash: "recovery-hash", verifiedAt: now, auditEvents: [] };

    const results = await Promise.all([repository.markStepUpVerifiedWithRecovery(command), repository.markStepUpVerifiedWithRecovery(command)]);

    expect(results.filter((item) => item === "verified")).toHaveLength(1);
    expect((await db.query("SELECT used_at FROM recovery_codes WHERE id='code'")).rows[0].used_at).not.toBeNull();
  });
});
