import { createHmac, randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { Clock } from "../common/clock";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { SecretGenerator } from "../common/secret-generator";
import { SigningKeyService } from "../crypto/signing-key.service";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
import { PostgresInviteRepository } from "../invites/postgres-invite.repository";
import { BootstrapAdminUseCase } from "../invites/usecases/bootstrap-admin.usecase";
import type { OtpDeliveryGateway } from "../mfa/otp-delivery.gateway";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";

const email = "admin@example.test";
const password = "uma senha longa o suficiente aqui";
let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;

afterEach(async () => {
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
  vi.restoreAllMocks();
});

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${app!.url}/auth/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function database(): AuthDatabase { return app!.app.get<AuthDatabase>(AUTH_DATABASE); }

async function expectSessionCount(count: number): Promise<void> {
  expect((await database().query("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count });
  expect((await database().query("SELECT count(*)::int AS count FROM refresh_tokens")).rows[0]).toEqual({ count });
}

async function activate(otpDelivery?: OtpDeliveryGateway): Promise<string> {
  fixture = await createPostgresTestDatabase();
  const key = randomBytes(32).toString("base64url");
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY: key, AUTH_MFA_SUSPENDED: "false" }, { otpDelivery });
  const now = new Date();
  await app.app.get(SigningKeyService).ensureActive(now, {
    correlationId: "email-mfa-e2e", actorUserId: null, action: "key.created", targetType: "signing_key",
    targetId: null, result: "succeeded", reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: now,
  });
  const bootstrap = new BootstrapAdminUseCase(app.app.get(PostgresInviteRepository), app.app.get(Clock), app.app.get(SecretGenerator));
  const invite = await bootstrap.execute({ email, name: "Admin", context: ANONYMOUS_CONTEXT });
  if (invite.kind !== "created") throw new Error("Expected a new invite");
  const accepted = await post("invites/accept", { token: invite.inviteToken, password });
  expect(accepted.status).toBe(201);
  expect(await accepted.json()).toEqual({ accepted: true });
  expect(app.otpMessages).toHaveLength(0);
  expect((await database().query("SELECT email,name,status,password_hash FROM users")).rows[0]).toEqual({
    email, name: "Admin", status: "active", password_hash: expect.any(String),
  });
  await expectSessionCount(0);
  return key;
}

async function login(): Promise<{ mfaToken: string; code: string }> {
  const response = await post("login", { email, password, secondFactor: "otp" });
  expect(response.status).toBe(202);
  const body = await response.json() as { mfaToken: string };
  expect(body).toEqual(expect.objectContaining({ mfaToken: expect.any(String), channel: "email", secondFactor: "otp" }));
  expect(body).not.toHaveProperty("accessToken");
  expect(body).not.toHaveProperty("refreshToken");
  const message = app!.otpMessages.at(-1)!;
  expect(message.email).toBe(email);
  expect(message.code).toMatch(/^\d{6}$/);
  await expectSessionCount(0);
  return { mfaToken: body.mfaToken, code: message.code };
}

async function denied(input: { mfaToken: string; code: string }): Promise<void> {
  const response = await post("mfa/verify", input);
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("");
}

describeWithPostgres("email MFA HTTP journey", () => {
  it("accepts a password-only invite, stores an HMAC, verifies email OTP and refreshes", async () => {
    const key = await activate();
    const input = await login();
    const challenge = (await database().query("SELECT id,code_hash FROM mfa_challenges")).rows[0];
    const expectedHash = createHmac("sha256", Buffer.from(key, "base64url"))
      .update(["auth-email-otp", challenge.id, input.code].join("\0")).digest("hex");
    expect(challenge.code_hash).toBe(expectedHash);
    expect(challenge.code_hash).not.toBe(input.code);
    const verified = await post("mfa/verify", input);
    expect(verified.status, JSON.stringify(app!.logger.events)).toBe(200);
    const tokens = await verified.json() as { accessToken: string; refreshToken: string; recoveryCodes: string[] };
    expect(tokens).toEqual(expect.objectContaining({ accessToken: expect.any(String), refreshToken: expect.any(String) }));
    expect(tokens.recoveryCodes).toHaveLength(10);
    expect(new Set(tokens.recoveryCodes).size).toBe(10);
    expect((await database().query("SELECT count(*)::int AS count FROM recovery_codes")).rows[0]).toEqual({ count: 10 });
    await expectSessionCount(1);
    const me = await fetch(`${app!.url}/auth/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual(expect.objectContaining({ email }));
    const refreshed = await post("token/refresh", { refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(200);
    const rotated = await refreshed.json() as { accessToken: string; refreshToken: string };
    expect(rotated.accessToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
  });

  it("rejects replay without issuing another session", async () => {
    await activate();
    const input = await login();
    expect((await post("mfa/verify", input)).status).toBe(200);
    await denied(input);
    await expectSessionCount(1);
  });

  it("allows the correct code on the fifth check", async () => {
    await activate();
    const input = await login();
    const wrong = input.code === "000000" ? "000001" : "000000";
    for (let index = 0; index < 4; index++) await denied({ ...input, code: wrong });
    await expectSessionCount(0);
    expect((await post("mfa/verify", input)).status).toBe(200);
    expect((await database().query("SELECT check_count FROM mfa_challenges")).rows[0].check_count).toBe(5);
    await expectSessionCount(1);
  });

  it("exhausts five wrong checks and rejects even the correct code afterward", async () => {
    await activate();
    const input = await login();
    const wrong = input.code === "000000" ? "000001" : "000000";
    for (let index = 0; index < 5; index++) await denied({ ...input, code: wrong });
    await denied(input);
    expect((await database().query("SELECT check_count FROM mfa_challenges")).rows[0].check_count).toBe(5);
    await expectSessionCount(0);
  });

  it("invalidates the old code on resend and accepts only the new one", async () => {
    await activate();
    const input = await login();
    const oldId = (await database().query("SELECT id FROM mfa_challenges")).rows[0].id;
    let newCode = input.code;
    // Independent random OTPs can collide; resend once more in that rare case.
    for (let tries = 0; tries < 2 && newCode === input.code; tries++) {
      expect((await post("mfa/resend", { mfaToken: input.mfaToken })).status).toBe(202);
      newCode = app!.otpMessages.at(-1)!.code;
    }
    expect(newCode).not.toBe(input.code);
    expect((await database().query("SELECT invalidated_at FROM mfa_challenges WHERE id=$1", [oldId])).rows[0].invalidated_at).not.toBeNull();
    await denied(input);
    await expectSessionCount(0);
    expect((await post("mfa/verify", { ...input, code: newCode })).status).toBe(200);
    await expectSessionCount(1);
  });

  it.each(["challenge", "attempt"] as const)("rejects an expired %s", async (target) => {
    await activate();
    const input = await login();
    const table = target === "challenge" ? "mfa_challenges" : "authentication_attempts";
    await database().query(`UPDATE ${table} SET expires_at=now()-interval '1 second'`);
    await denied(input);
    await expectSessionCount(0);
  });

  it("returns 503 on SMTP delivery failure without issuing a session", async () => {
    const send = vi.fn(async () => { throw new Error("SMTP unavailable"); });
    await activate({ send });
    const response = await post("login", { email, password, secondFactor: "otp" });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("SMTP unavailable");
    expect(body).not.toContain("accessToken");
    expect(body).not.toContain("refreshToken");
    expect(send).toHaveBeenCalledExactlyOnceWith({ email, code: expect.stringMatching(/^\d{6}$/) });
    await expectSessionCount(0);
    expect((await database().query("SELECT count(*)::int AS count FROM authentication_attempts")).rows[0]).toEqual({ count: 0 });
  });

  it("verifies a persisted challenge after restart with the same KEK without sending again", async () => {
    const key = await activate();
    const input = await login();
    await app!.close(); app = undefined;
    const send = vi.fn(async () => { throw new Error("Delivery must not run during verification"); });
    app = await createTestApp({ AUTH_DATABASE_URL: fixture!.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY: key, AUTH_MFA_SUSPENDED: "false" }, { otpDelivery: { send } });
    const response = await post("mfa/verify", input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ accessToken: expect.any(String), refreshToken: expect.any(String) }));
    expect(send).not.toHaveBeenCalled();
    await expectSessionCount(1);
  });
});
