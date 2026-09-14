import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import {
  createPostgresTestDatabase,
  describeWithPostgres,
  type PostgresTestDatabase,
} from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { SigningKeyService } from "../crypto/signing-key.service";
import { hashSecretToken } from "../crypto/secret-token";
import { buildUnsignedGuestTokenClaims, buildUnsignedSignupTokenClaims } from "../crypto/jwt";
import { SECURITY_POLICY } from "../config/security-policy";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  await fixture?.close();
  fixture = undefined;
});

async function seedActiveUser(db: AuthDatabase, overrides: { status?: string } = {}): Promise<string> {
  const userId = ulid();
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Test User', 'hash', $3, now(), now())`,
    [userId, `${userId.toLowerCase()}@example.test`, overrides.status ?? "active"],
  );
  return userId;
}

async function seedSession(
  db: AuthDatabase,
  userId: string,
  now: Date,
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = ulid();
  await db.query(
    `INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, created_at)
     VALUES ($1, $2, ARRAY['pwd'], $3, $3, $3)`,
    [sessionId, userId, now],
  );
  const refreshToken = ulid();
  const expiresAt = new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000);
  await db.query(
    `INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [ulid(), hashSecretToken(refreshToken), sessionId, expiresAt, now],
  );
  return { sessionId, refreshToken };
}

async function ensureSigningKey(app: TestApp, now: Date): Promise<void> {
  await app.app.get(SigningKeyService).ensureActive(now);
}

describeWithPostgres("Session HTTP endpoints", () => {
  it("rotates a refresh token and rejects the consumed one as reused", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedActiveUser(db);
    const { refreshToken } = await seedSession(db, userId, now);

    const first = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { accessToken: string; refreshToken: string };
    expect(typeof body.accessToken).toBe("string");
    expect(body.refreshToken).not.toBe(refreshToken);

    const reused = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(reused.status).toBe(401);
    expect(await reused.text()).toBe("");

    const successorAfterReuse = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: body.refreshToken }),
    });
    expect(successorAfterReuse.status).toBe(401);
  });

  it("rejects an unknown or malformed refresh token without leaking why", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const now = new Date();
    await ensureSigningKey(app, now);

    const response = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "not-a-real-token" }),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("logs out idempotently without revealing whether the session was already revoked", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedActiveUser(db);
    const { refreshToken } = await seedSession(db, userId, now);

    const firstLogout = await fetch(`${app.url}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(firstLogout.status).toBe(204);

    const secondLogout = await fetch(`${app.url}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(secondLogout.status).toBe(204);

    const unknownTokenLogout = await fetch(`${app.url}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "never-existed" }),
    });
    expect(unknownTokenLogout.status).toBe(204);

    const refreshAfterLogout = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("issues user tokens on refresh and refuses signup and guest tokens on the user-token routes", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedActiveUser(db);
    const { refreshToken, sessionId } = await seedSession(db, userId, now);

    const refreshed = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const { accessToken } = (await refreshed.json()) as { accessToken: string };
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8"));
    expect(payload).toMatchObject({ token_use: "user", sub: userId, sid: sessionId });
    expect(payload).not.toHaveProperty("amr");
    expect(payload).not.toHaveProperty("auth_time");

    const keys = app.app.get(SigningKeyService);
    const active = (await db.query<{ kid: string; encrypted_private_key: string }>(
      "SELECT kid, encrypted_private_key FROM signing_keys WHERE status = 'active'",
    )).rows[0]!;
    const signingKey = { kid: active.kid, encryptedPrivateKey: active.encrypted_private_key };
    const issuer = { iss: "https://auth.example.test", aud: "timeline-api", now };
    const signup = keys.mintToken(signingKey, buildUnsignedSignupTokenClaims({ ...issuer, sub: userId }));
    const guest = keys.mintToken(signingKey, buildUnsignedGuestTokenClaims({ ...issuer, sub: ulid(), subj: userId, perms: ["event:read"] }));
    expect(signup.jti).not.toBe(guest.jti);

    for (const token of [signup.token, guest.token]) {
      const me = await fetch(`${app.url}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
      expect(me.status).toBe(401);
      const logoutAll = await fetch(`${app.url}/auth/logout-all`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
      expect(logoutAll.status).toBe(401);
    }
  });

  it("exposes the current actor on GET /auth/me and revokes every session on logout-all", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const now = new Date();
    await ensureSigningKey(app, now);
    const userId = await seedActiveUser(db);
    const { refreshToken: firstSessionToken } = await seedSession(db, userId, now);
    const { refreshToken: secondSessionToken } = await seedSession(db, userId, now);

    const refreshed = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: firstSessionToken }),
    });
    const { accessToken } = (await refreshed.json()) as { accessToken: string };

    const me = await fetch(`${app.url}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      userId,
      email: expect.stringContaining("@example.test"),
      name: "Test User",
      sessionId: expect.any(String),
      roles: [],
      permissions: [],
      denies: [],
    });

    const withoutBearer = await fetch(`${app.url}/auth/me`);
    expect(withoutBearer.status).toBe(401);

    const logoutAll = await fetch(`${app.url}/auth/logout-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(logoutAll.status).toBe(204);

    const meAfterLogoutAll = await fetch(`${app.url}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meAfterLogoutAll.status).toBe(401);

    const otherSessionRefreshAfterLogoutAll = await fetch(`${app.url}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: secondSessionToken }),
    });
    expect(otherSessionRefreshAfterLogoutAll.status).toBe(401);
  });
});
