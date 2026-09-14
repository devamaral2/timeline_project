import { afterEach, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { Clock } from "../common/clock";
import { SecretGenerator } from "../common/secret-generator";
import { SigningKeyService } from "../crypto/signing-key.service";
import { BootstrapAdminUseCase } from "../invites/usecases/bootstrap-admin.usecase";
import { PostgresInviteRepository } from "../invites/postgres-invite.repository";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

const json = { "content-type": "application/json" };
const PASSWORD = "uma frase de acesso comprida";

async function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: json, body: JSON.stringify(body) });
}

/** Sobe um app com `AUTH_MFA_SUSPENDED=true` e um admin ativo pronto para logar. */
async function boot(): Promise<{ app: TestApp; email: string }> {
  fixture = await createPostgresTestDatabase();
  const AUTH_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  // Ativa o convite com senha; suspensao de MFA so altera o login.
  const setup = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY });
  const now = new Date();
  await setup.app.get(SigningKeyService).ensureActive(now);
  const bootstrap = new BootstrapAdminUseCase(setup.app.get(PostgresInviteRepository), setup.app.get(Clock), setup.app.get(SecretGenerator));
  const bootstrapped = await bootstrap.execute({ email: "admin@example.test", name: "Admin", context: ANONYMOUS_CONTEXT });
  const inviteToken = (bootstrapped as { inviteToken: string }).inviteToken;
  const started = await post(`${setup.url}/auth/invites/accept`, { token: inviteToken, password: PASSWORD });
  expect(started.status).toBe(201);
  expect(await started.json()).toEqual({accepted:true});
  await setup.close();

  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY, AUTH_MFA_SUSPENDED: "true" });
  return { app, email: "admin@example.test" };
}

describeWithPostgres("MFA suspensa", () => {
  it("login devolve a sessao completa direto, sem desafio", async () => {
    const { app: target, email } = await boot();
    const login = await post(`${target.url}/auth/login`, { email, password: PASSWORD, secondFactor: "otp" });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number; refreshTokenExpiresAt: string; recoveryCodes: string[] };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.accessTokenExpiresInSeconds).toBeGreaterThan(0);
    expect(new Date(body.refreshTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(body.recoveryCodes).toHaveLength(10);

    const authed = { ...json, authorization: `Bearer ${body.accessToken}` };
    const me = await fetch(`${target.url}/auth/me`, { headers: authed });
    expect(me.status).toBe(200);
  }, 60_000);

  it("mfa/verify, mfa/recover e mfa/resend recusam com 410", async () => {
    const { app: target } = await boot();
    const verify = await post(`${target.url}/auth/mfa/verify`, { mfaToken: "whatever", code: "000000" });
    expect(verify.status).toBe(410);
    expect(await verify.json()).toEqual({ code: "mfa_suspended" });

    const recover = await post(`${target.url}/auth/mfa/recover`, { mfaToken: "whatever", recoveryCode: "AAAA-AAAA-AAAA-AAAA" });
    expect(recover.status).toBe(410);
    expect(await recover.json()).toEqual({ code: "mfa_suspended" });

    const resend = await post(`${target.url}/auth/mfa/resend`, { mfaToken: "whatever" });
    expect(resend.status).toBe(410);
    expect(await resend.json()).toEqual({ code: "mfa_suspended" });
  }, 60_000);
});
