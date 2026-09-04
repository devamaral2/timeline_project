import { afterEach, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { Clock } from "../common/clock";
import { SecretGenerator } from "../common/secret-generator";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { HttpPwnedPasswordsGateway } from "../credentials/http-pwned-passwords.gateway";
import { SigningKeyService } from "../crypto/signing-key.service";
import { verifyJwt } from "../crypto/jwt";
import type { PublicSigningJwk } from "../crypto/jwk";
import { BootstrapAdminUseCase } from "../invites/usecases/bootstrap-admin.usecase";
import { PostgresInviteRepository } from "../invites/postgres-invite.repository";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { startFakeHttpServer, type FakeHttpServer } from "../testing/fake-http-server";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
let restarted: TestApp | undefined;
let hibp: FakeHttpServer | undefined;
afterEach(async () => {
  await restarted?.close(); restarted = undefined;
  await app?.close(); app = undefined;
  await hibp?.close(); hibp = undefined;
  await fixture?.close(); fixture = undefined;
});

const json = { "content-type": "application/json" };
const PASSWORD = "uma frase de acesso comprida";
const PHONE = "+5511987654321";

function authed(accessToken: string) { return { ...json, authorization: `Bearer ${accessToken}` }; }
async function post(url: string, body: unknown, headers: Record<string, string> = json) {
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}
function claimsOf(accessToken: string): { roles: string[]; perms: string[]; denies: string[]; sub: string; sid: string } {
  return JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString());
}
function tokenFromLink(link: string): string {
  return new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
}

/** Aceita um convite de ponta a ponta e devolve o primeiro par de tokens. */
async function acceptInvite(target: TestApp, inviteToken: string): Promise<{ accessToken: string; refreshToken: string; recoveryCodes: string[] }> {
  const inspected = await post(`${target.url}/auth/invites/inspect`, { token: inviteToken });
  expect(inspected.status).toBe(201);
  const started = await post(`${target.url}/auth/invites/accept`, { token: inviteToken, password: PASSWORD, phone: PHONE, channel: "sms" });
  expect(started.status).toBe(201);
  const { mfaToken } = (await started.json()) as { mfaToken: string };
  const verified = await post(`${target.url}/auth/mfa/verify`, { mfaToken, code: "000000" });
  expect(verified.status).toBe(200);
  return (await verified.json()) as { accessToken: string; refreshToken: string; recoveryCodes: string[] };
}

describeWithPostgres("Stage 1 journey", () => {
  it("walks the whole lifecycle against a real Nest, a real Postgres and fake HTTP providers", async () => {
    // 1. Banco vazio migrado pelo fixture, e o primeiro admin criado pelo
    //    bootstrap -- o unico caminho de entrada que nao exige um convite.
    fixture = await createPostgresTestDatabase();
    const AUTH_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    hibp = await startFakeHttpServer(() => ({ status: 200, body: `${"0".repeat(35)}:1\r\n` }));
    app = await createTestApp(
      { AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY },
      { pwnedPasswords: new HttpPwnedPasswordsGateway(2000, hibp.fetcher) },
    );
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await app.app.get(SigningKeyService).ensureActive(now, {
      correlationId: "journey", actorUserId: null, action: "key.created", targetType: "signing_key", targetId: null,
      result: "succeeded", reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: now,
    });
    const bootstrap = new BootstrapAdminUseCase(app.app.get(PostgresInviteRepository), app.app.get(Clock), app.app.get(SecretGenerator));
    const bootstrapped = await bootstrap.execute({ email: "admin@example.test", name: "Primeira Admin", context: ANONYMOUS_CONTEXT });
    expect(bootstrapped.kind).toBe("created");
    const adminInviteToken = (bootstrapped as { inviteToken: string }).inviteToken;

    // 2. Convite inspecionado, aceito e verificado: a sessao nasce junto com os
    //    dez recovery codes, mostrados uma unica vez.
    const admin = await acceptInvite(app, adminInviteToken);
    expect(admin.recoveryCodes).toHaveLength(10);
    expect(hibp.requests.length).toBeGreaterThan(0);
    expect(claimsOf(admin.accessToken)).toMatchObject({ roles: ["admin"], perms: ["*:manage"] });

    // 3. Login com senha e OTP, refresh e logout.
    const login = await post(`${app.url}/auth/login`, { email: "admin@example.test", password: PASSWORD, secondFactor: "otp" });
    expect(login.status).toBe(202);
    const loginVerified = await post(`${app.url}/auth/mfa/verify`, { mfaToken: ((await login.json()) as { mfaToken: string }).mfaToken, code: "000000" });
    expect(loginVerified.status).toBe(200);
    const loggedIn = (await loginVerified.json()) as { accessToken: string; refreshToken: string };
    const refreshed = await post(`${app.url}/auth/token/refresh`, { refreshToken: loggedIn.refreshToken });
    expect(refreshed.status).toBe(200);
    const refreshedTokens = (await refreshed.json()) as { accessToken: string; refreshToken: string };
    expect((await post(`${app.url}/auth/logout`, { refreshToken: refreshedTokens.refreshToken })).status).toBe(204);

    // 4. Login por recovery code, com o provider de OTP intocado: nenhum
    //    desafio novo aparece no banco.
    const challengesBefore = (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM mfa_challenges")).rows[0]!.count;
    const recoveryLogin = await post(`${app.url}/auth/login`, { email: "admin@example.test", password: PASSWORD, secondFactor: "recovery" });
    expect(recoveryLogin.status).toBe(202);
    const recovered = await post(`${app.url}/auth/mfa/recover`, { mfaToken: ((await recoveryLogin.json()) as { mfaToken: string }).mfaToken, recoveryCode: admin.recoveryCodes[0] });
    expect(recovered.status).toBe(200);
    const recoveredTokens = (await recovered.json()) as { accessToken: string; refreshToken: string };
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM mfa_challenges")).rows[0]!.count).toBe(challengesBefore);

    // 5. Step-up e regeneracao: os codigos anteriores morrem.
    const stepUp = await post(`${app.url}/auth/step-up/start`, { purpose: "recovery_regeneration", secondFactor: "otp" }, authed(recoveredTokens.accessToken));
    expect(stepUp.status).toBe(202);
    const { stepUpToken } = (await stepUp.json()) as { stepUpToken: string };
    expect((await post(`${app.url}/auth/step-up/verify`, { stepUpToken, code: "000000" }, authed(recoveredTokens.accessToken))).status).toBe(200);
    const regenerated = await post(`${app.url}/auth/recovery-codes/regenerate`, { stepUpToken }, authed(recoveredTokens.accessToken));
    expect(regenerated.status).toBe(200);
    const fresh = (await regenerated.json()) as { recoveryCodes: string[] };
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect(fresh.recoveryCodes).not.toContain(admin.recoveryCodes[1]);

    const staleRecovery = await post(`${app.url}/auth/login`, { email: "admin@example.test", password: PASSWORD, secondFactor: "recovery" });
    const staleAttempt = await post(`${app.url}/auth/mfa/recover`, { mfaToken: ((await staleRecovery.json()) as { mfaToken: string }).mfaToken, recoveryCode: admin.recoveryCodes[1] });
    expect(staleAttempt.status).toBe(401);

    // 6. Um membro convidado pelo admin, com o link anterior morto na reemissao.
    const adminBearer = authed(recoveredTokens.accessToken);
    const created = await post(`${app.url}/auth/admin/invites`, { email: "membro@example.test", name: "Membro", roleKeys: ["member"], directPermissions: [] }, adminBearer);
    expect(created.status).toBe(201);
    const memberInvite = (await created.json()) as { userId: string; inviteLink: string };
    const reissued = await fetch(`${app.url}/auth/admin/users/${memberInvite.userId}/invite/reissue`, { method: "POST", headers: adminBearer });
    expect(reissued.status).toBe(200);
    const reissuedLink = ((await reissued.json()) as { inviteLink: string }).inviteLink;
    expect((await post(`${app.url}/auth/invites/inspect`, { token: tokenFromLink(memberInvite.inviteLink) })).status).toBe(401);

    const member = await acceptInvite(app, tokenFromLink(reissuedLink));
    expect(claimsOf(member.accessToken).roles).toEqual(["member"]);

    // 7. RBAC trocado aparece no refresh, nunca no token ja assinado.
    const replaced = await fetch(`${app.url}/auth/admin/users/${memberInvite.userId}/access`, { method: "PUT", headers: adminBearer, body: JSON.stringify({ roleKeys: ["viewer"], directPermissions: [{ permission: "tag:read", effect: "deny" }] }) });
    expect(replaced.status).toBe(200);
    expect(claimsOf(member.accessToken).roles).toEqual(["member"]);
    const memberRefreshed = await post(`${app.url}/auth/token/refresh`, { refreshToken: member.refreshToken });
    expect(memberRefreshed.status).toBe(200);
    const memberTokens = (await memberRefreshed.json()) as { accessToken: string; refreshToken: string };
    expect(claimsOf(memberTokens.accessToken)).toMatchObject({ roles: ["viewer"], denies: ["tag:read"] });

    // 9. Deteccao de reuso: o refresh ja consumido derruba a familia inteira.
    const reused = await post(`${app.url}/auth/token/refresh`, { refreshToken: member.refreshToken });
    expect(reused.status).toBe(401);
    expect(await reused.text()).toBe("");
    expect((await post(`${app.url}/auth/token/refresh`, { refreshToken: memberTokens.refreshToken })).status).toBe(401);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM sessions WHERE user_id=$1 AND revoked_at IS NOT NULL", [memberInvite.userId])).rows[0]!.count).toBeGreaterThan(0);

    // 8. Suspenso, o membro nao consegue mais nem tentar.
    const suspended = await fetch(`${app.url}/auth/admin/users/${memberInvite.userId}/status`, { method: "PATCH", headers: adminBearer, body: JSON.stringify({ status: "suspended" }) });
    expect(suspended.status).toBe(200);
    const memberLogin = await post(`${app.url}/auth/login`, { email: "membro@example.test", password: PASSWORD, secondFactor: "otp" });
    expect(memberLogin.status).toBe(401);

    // 10. O JWT se sustenta apenas com o snapshot publico do JWKS.
    const jwks = await fetch(`${app.url}/.well-known/jwks.json`);
    const snapshot = (await jwks.json()) as { keys: PublicSigningJwk[] };
    const verifiedClaims = verifyJwt(memberTokens.accessToken, snapshot.keys, "https://auth.example.test", "timeline-api", new Date());
    expect(verifiedClaims.sub).toBe(memberInvite.userId);
    expect(JSON.stringify(snapshot)).not.toContain("encrypted_private_key");

    // 11. Rate limit persistente: ele vive no Postgres, nao na memoria do
    //     processo, entao sobrevive a um restart.
    const stranger = { email: "ninguem@example.test", password: "senha errada mesmo", secondFactor: "otp" as const };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await post(`${app.url}/auth/login`, stranger)).status).toBe(401);
    }
    const blocked = await post(`${app.url}/auth/login`, stranger);
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toBe("");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    restarted = await createTestApp(
      { AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY },
      { pwnedPasswords: new HttpPwnedPasswordsGateway(2000, hibp.fetcher) },
    );
    expect((await post(`${restarted.url}/auth/login`, stranger)).status).toBe(429);

    // 12. Saude e cache do JWKS.
    expect((await fetch(`${restarted.url}/health/live`)).status).toBe(200);
    expect((await fetch(`${restarted.url}/health/ready`)).status).toBe(200);
    const etag = jwks.headers.get("etag")!;
    const cached = await fetch(`${restarted.url}/.well-known/jwks.json`, { headers: { "if-none-match": etag } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
  }, 60_000);
});
