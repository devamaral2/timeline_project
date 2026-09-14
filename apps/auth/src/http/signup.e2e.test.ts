import { afterEach, expect, it } from "vitest";
import { Clock } from "../common/clock";
import { SecretGenerator } from "../common/secret-generator";
import { buildUnsignedSignupTokenClaims, verifyJwt } from "../crypto/jwt";
import { SigningKeyService } from "../crypto/signing-key.service";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
import { PostgresSignupTokenRepository } from "../signup/postgres-signup-token.repository";
import { CreateSignupLinkUseCase } from "../signup/usecases/create-signup-link.usecase";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

const ISSUER = "https://auth.example.test";
const AUDIENCE = "timeline-api";
const PASSWORD = "Senha-Do-Admin-2026";
const json = { "content-type": "application/json" };
const tokenOf = (link: string) => new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;

async function boot() {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  const keys = app.app.get(SigningKeyService);
  await keys.ensureActive(new Date());
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const links = new CreateSignupLinkUseCase(new PostgresSignupTokenRepository(db), keys, app.app.get(Clock), app.app.get(SecretGenerator), {
    issuer: ISSUER, audience: AUDIENCE, webAppUrl: new URL("https://web.example.test"),
  });
  return { keys, db, links };
}

function body(overrides: Record<string, unknown> = {}) {
  return { email: "Admin@Example.test", phone: "+55 (11) 99999-0000", name: "  Ana Admin ", password: PASSWORD, passwordConfirmation: PASSWORD, ...overrides };
}

function signup(token: string, payload: unknown = body()) {
  return fetch(`${app!.url}/auth/signup`, { method: "POST", headers: { ...json, authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

describeWithPostgres("POST /auth/signup", () => {
  it("script -> signup -> login -> verify -> refresh, end to end", async () => {
    const { keys, db, links } = await boot();
    const created = await links.execute();

    const response = await signup(tokenOf(created.link));
    expect(response.status).toBe(201);
    const tokens = (await response.json()) as { userId: string; accessToken: string; refreshToken: string };
    expect(tokens.userId).toBe(created.userId);

    const row = (await db.query("SELECT email, phone, name, status, password_hash FROM users WHERE id = $1", [created.userId])).rows[0];
    expect(row).toMatchObject({ email: "admin@example.test", phone: "+5511999990000", name: "Ana Admin", status: "active" });
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
    expect((await db.query("SELECT role_key FROM user_roles WHERE user_id = $1", [created.userId])).rows).toEqual([{ role_key: "admin" }]);

    const signupClaims = verifyJwt(tokens.accessToken, keys.publicJwks().keys, ISSUER, AUDIENCE, new Date(), ["user"]);
    expect(signupClaims).toMatchObject({ sub: created.userId, roles: ["admin"], perms: ["*:manage"] });

    const login = await fetch(`${app!.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: "admin@example.test", password: PASSWORD }) });
    expect(login.status).toBe(200);
    const loginTokens = (await login.json()) as { accessToken: string; refreshToken: string };
    const jwks = (await (await fetch(`${app!.url}/.well-known/jwks.json`)).json()) as { keys: Parameters<typeof verifyJwt>[1] };
    expect(verifyJwt(loginTokens.accessToken, jwks.keys, ISSUER, AUDIENCE, new Date(), ["user"]).sub).toBe(created.userId);

    const me = await fetch(`${app!.url}/auth/me`, { headers: { authorization: `Bearer ${loginTokens.accessToken}` } });
    expect(await me.json()).toMatchObject({ userId: created.userId, email: "admin@example.test", name: "Ana Admin", roles: ["admin"] });

    const refreshed = await fetch(`${app!.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: loginTokens.refreshToken }) });
    expect(refreshed.status).toBe(200);
  });

  it("lets exactly one of two concurrent requests with the same token create the admin", async () => {
    const { db, links } = await boot();
    const token = tokenOf((await links.execute()).link);

    const responses = await Promise.all([
      signup(token, body({ email: "primeira@example.test", phone: "+5511900000001" })),
      signup(token, body({ email: "segunda@example.test", phone: "+5511900000002" })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE status = 'active'")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT count(*)::int AS count FROM user_roles WHERE role_key = 'admin'")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count: 1 });
  });

  it("refuses a consumed token, a reissued-away token and a token whose account is already active", async () => {
    const { db, links } = await boot();
    const first = await links.execute();
    expect((await signup(tokenOf(first.link))).status).toBe(201);
    const again = await signup(tokenOf(first.link), body({ email: "outra@example.test", phone: "+5511900000009" }));
    expect([again.status, await again.text()]).toEqual([401, ""]);

    const pending = await links.execute();
    const reissued = await links.execute({ reissueUserId: pending.userId });
    expect((await signup(tokenOf(pending.link), body({ email: "velho@example.test", phone: "+5511900000003" }))).status).toBe(401);
    expect((await signup(tokenOf(reissued.link), body({ email: "novo@example.test", phone: "+5511900000004" }))).status).toBe(201);

    const third = await links.execute();
    await db.query("UPDATE users SET status = 'active', email = 'manual@example.test', password_hash = 'h' WHERE id = $1", [third.userId]);
    expect((await signup(tokenOf(third.link), body({ email: "x@example.test", phone: "+5511900000005" }))).status).toBe(401);
  });

  it("refuses a signup token past its hour", async () => {
    const { keys, db, links } = await boot();
    const created = await links.execute();
    const jti = (await db.query<{ jti: string }>("SELECT jti FROM signup_tokens WHERE user_id = $1", [created.userId])).rows[0]!.jti;
    const past = new Date(Date.now() - (3600 + 31) * 1000);
    const expired = await keys.mintWithActiveKey(buildUnsignedSignupTokenClaims({ iss: ISSUER, aud: AUDIENCE, sub: created.userId, now: past }), new Date());
    await db.query("UPDATE signup_tokens SET jti = $1 WHERE jti = $2", [expired.jti, jti]);

    expect((await signup(expired.token)).status).toBe(401);
  });

  it("evaluates the password against the submitted email and name, one code per rule, without burning the link", async () => {
    const { links } = await boot();
    const token = tokenOf((await links.execute()).link);

    for (const [code, password, overrides] of [
      ["password_length", "Curta-1", {}],
      ["password_uppercase", "senha-sem-maiuscula-1", {}],
      ["password_digit", "Senha-Sem-Digito", {}],
      ["password_symbol", "SenhaSemSimbolo1", {}],
      ["password_context", "Ana.Admin-01@example.test", { email: "ana.admin-01@example.test" }],
    ] as const) {
      const response = await signup(token, body({ password, passwordConfirmation: password, ...overrides }));
      expect([code, response.status, await response.json()]).toEqual([code, 422, { code }]);
    }
    expect((await signup(token)).status).toBe(201);
  });

  it("rejects a confirmation mismatch, a phone without country code and unknown fields as 400", async () => {
    const { links } = await boot();
    const token = tokenOf((await links.execute()).link);

    for (const payload of [
      body({ passwordConfirmation: `${PASSWORD}x` }),
      body({ phone: "11 99999-0000" }),
      body({ email: "sem-arroba" }),
      { ...body(), role: "admin" },
    ]) {
      const response = await signup(token, payload);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "invalid_request" });
    }
  });

  it("answers 409 for an email or phone already in use and keeps the link usable", async () => {
    const { links } = await boot();
    expect((await signup(tokenOf((await links.execute()).link))).status).toBe(201);
    const token = tokenOf((await links.execute()).link);

    const sameEmail = await signup(token, body({ phone: "+5511900000010" }));
    expect([sameEmail.status, await sameEmail.json()]).toEqual([409, { code: "email_already_exists" }]);
    const samePhone = await signup(token, body({ email: "outra@example.test" }));
    expect([samePhone.status, await samePhone.json()]).toEqual([409, { code: "phone_already_exists" }]);
    expect((await signup(token, body({ email: "outra@example.test", phone: "+5511900000010" }))).status).toBe(201);
  });

  it("accepts only a signup token: a user token gets a typed 403, and no bearer is a 401", async () => {
    const { links } = await boot();
    const created = await signup(tokenOf((await links.execute()).link));
    const { accessToken } = (await created.json()) as { accessToken: string };

    expect((await signup(accessToken, body({ email: "x@example.test", phone: "+5511900000011" }))).status).toBe(403);
    const anonymous = await fetch(`${app!.url}/auth/signup`, { method: "POST", headers: json, body: JSON.stringify(body()) });
    expect(anonymous.status).toBe(401);
  });
});
