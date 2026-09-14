import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { ulid } from "ulid";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { SigningKeyService } from "../crypto/signing-key.service";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { RequiredDependencyUnavailableError } from "../common/errors";
import { hashSecretToken } from "../crypto/secret-token";
import { hashRecoveryCode } from "../mfa/recovery-code";
import { SECURITY_POLICY } from "../config/security-policy";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
let secondApp: TestApp | undefined;
afterEach(async () => {
  await secondApp?.close(); secondApp = undefined;
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

const json = { "content-type": "application/json" };

async function ensureSigningKey(target: TestApp, now: Date): Promise<void> {
  await target.app.get(SigningKeyService).ensureActive(now);
}

async function seedEnrolledUser(db: AuthDatabase, now: Date): Promise<string> {
  const userId = ulid();
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Step Up User', 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'active', $3, $3)`,
    [userId, `${userId.toLowerCase()}@example.test`, now],
  );
  return userId;
}

async function seedSession(db: AuthDatabase, userId: string, now: Date): Promise<string> {
  const sessionId = ulid();
  await db.query(`INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, created_at) VALUES ($1, $2, ARRAY['pwd','otp'], $3, $3, $3)`, [sessionId, userId, now]);
  const refreshToken = ulid();
  await db.query(`INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [ulid(), hashSecretToken(refreshToken), sessionId, new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000), now]);
  return refreshToken;
}

async function bearerFor(target: TestApp, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${target.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken }) });
  expect(response.status).toBe(200);
  return (await response.json()) as { accessToken: string; refreshToken: string };
}

async function startStepUp(target: TestApp, accessToken: string, body: { purpose: string; secondFactor: string }) {
  return fetch(`${target.url}/auth/step-up/start`, { method: "POST", headers: { ...json, authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
}

describeWithPostgres("Step-up HTTP endpoints", () => {
  it("changes the password behind a one-time step-up and revokes every earlier session", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedEnrolledUser(db, now);
    const otherSessionRefresh = await seedSession(db, userId, now);
    const tokens = await bearerFor(app, await seedSession(db, userId, now));

    const started = await startStepUp(app, tokens.accessToken, { purpose: "password_change", secondFactor: "otp" });
    expect(started.status).toBe(202);
    const startBody = (await started.json()) as { stepUpToken: string; channel: string; maskedDestination: string };
    expect(startBody).toMatchObject({ channel: "email", maskedDestination: expect.stringMatching(/\*\*\*@example\.test$/) });

    const verified = await fetch(`${app.url}/auth/step-up/verify`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, code: app.otpMessages.at(-1)!.code }) });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ stepUpToken: startBody.stepUpToken, purpose: "password_change" });

    const changed = await fetch(`${app.url}/auth/password/change`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, newPassword: "uma senha longa o suficiente aqui" }) });
    expect(changed.status).toBe(200);
    const changedBody = (await changed.json()) as Record<string, unknown>;
    expect(Object.keys(changedBody).sort()).toEqual(["accessToken", "accessTokenExpiresInSeconds", "refreshToken", "refreshTokenExpiresAt"]);

    // Uso unico: o mesmo step-up nao serve para uma segunda troca.
    const replay = await fetch(`${app.url}/auth/password/change`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, newPassword: "outra senha longa o suficiente" }) });
    expect(replay.status).toBe(401);
    expect(await replay.text()).toBe("");

    // Todas as sessoes anteriores caem; a substituta funciona.
    for (const dead of [tokens.refreshToken, otherSessionRefresh]) {
      const refreshed = await fetch(`${app.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: dead }) });
      expect(refreshed.status).toBe(401);
    }
    const survivor = await fetch(`${app.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: changedBody.refreshToken }) });
    expect(survivor.status).toBe(200);
  });

  it("keeps the step-up available when the password blocklist is unreachable", async () => {
    fixture = await createPostgresTestDatabase();
    const unreachable = { isCompromised: async () => { throw new RequiredDependencyUnavailableError("password blocklist unavailable"); } };
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl }, { pwnedPasswords: unreachable });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedEnrolledUser(db, now);
    const tokens = await bearerFor(app, await seedSession(db, userId, now));

    const startBody = (await (await startStepUp(app, tokens.accessToken, { purpose: "password_change", secondFactor: "otp" })).json()) as { stepUpToken: string };
    await fetch(`${app.url}/auth/step-up/verify`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, code: app.otpMessages.at(-1)!.code }) });

    const failed = await fetch(`${app.url}/auth/password/change`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, newPassword: "uma senha longa o suficiente aqui" }) });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ code: "service_unavailable" });

    const attempt = await db.query<{ consumed_at: Date | null; verified_at: Date | null }>("SELECT consumed_at, verified_at FROM authentication_attempts WHERE token_hash = $1", [hashSecretToken(startBody.stepUpToken)]);
    expect(attempt.rows[0]?.consumed_at).toBeNull();
    expect(attempt.rows[0]?.verified_at).not.toBeNull();
  });

  it("regenerates recovery codes through a recovery step-up with the OTP provider unused", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedEnrolledUser(db, now);
    await db.query("INSERT INTO recovery_codes (id, user_id, code_hash, generation, created_at) VALUES ($1, $2, $3, 1, $4)", [ulid(), userId, hashRecoveryCode("AAAABBBBCCCCDDDD"), now]);
    const survivingRefresh = await seedSession(db, userId, now);
    const tokens = await bearerFor(app, await seedSession(db, userId, now));

    const started = await startStepUp(app, tokens.accessToken, { purpose: "recovery_regeneration", secondFactor: "recovery" });
    expect(started.status).toBe(202);
    const startBody = (await started.json()) as { stepUpToken: string; channel?: string };
    expect(startBody.channel).toBeUndefined();

    const recovered = await fetch(`${app.url}/auth/step-up/recover`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken, recoveryCode: "AAAA-BBBB-CCCC-DDDD" }) });
    expect(recovered.status).toBe(200);

    const regenerated = await fetch(`${app.url}/auth/recovery-codes/regenerate`, { method: "POST", headers: { ...json, authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ stepUpToken: startBody.stepUpToken }) });
    expect(regenerated.status).toBe(200);
    const codes = (await regenerated.json()) as { recoveryCodes: string[] };
    expect(codes.recoveryCodes).toHaveLength(10);

    const rows = await db.query<{ generation: number; used_at: Date | null; revoked_at: Date | null }>("SELECT generation, used_at, revoked_at FROM recovery_codes WHERE user_id = $1 ORDER BY generation", [userId]);
    expect(rows.rows.filter((row) => row.generation === 2)).toHaveLength(10);
    expect(rows.rows.find((row) => row.generation === 1)?.used_at).not.toBeNull();

    // Regenerar nao derruba sessao nenhuma.
    const stillAlive = await fetch(`${app.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: survivingRefresh }) });
    expect(stillAlive.status).toBe(200);
  });

  it("refuses the fourth OTP send in the window and keeps refusing after a restart", async () => {
    fixture = await createPostgresTestDatabase();
    // A mesma KEK nos dois processos: e dela que sai tanto a chave de
    // assinatura quanto o hash do balde de rate limit. Trocar a KEK seria
    // trocar de instalacao, nao reiniciar a mesma.
    const AUTH_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedEnrolledUser(db, now);
    const tokens = await bearerFor(app, await seedSession(db, userId, now));

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect((await startStepUp(app, tokens.accessToken, { purpose: "password_change", secondFactor: "otp" })).status).toBe(202);
    }
    const fourth = await startStepUp(app, tokens.accessToken, { purpose: "password_change", secondFactor: "otp" });
    expect(fourth.status).toBe(429);
    expect(await fourth.text()).toBe("");
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);

    secondApp = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY });
    const afterRestart = await startStepUp(secondApp, tokens.accessToken, { purpose: "password_change", secondFactor: "otp" });
    expect(afterRestart.status).toBe(429);
  });
});
