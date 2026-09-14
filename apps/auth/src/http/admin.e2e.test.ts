import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { SigningKeyService } from "../crypto/signing-key.service";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { hashSecretToken } from "../crypto/secret-token";
import { SECURITY_POLICY } from "../config/security-policy";
import { AUTH_DATABASE } from "../db/tokens";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
let adminDb: AuthDatabase | undefined;
afterEach(async () => {
  await adminDb?.close(); adminDb = undefined;
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

const json = { "content-type": "application/json" };

async function ensureSigningKey(target: TestApp, now: Date): Promise<void> {
  await target.app.get(SigningKeyService).ensureActive(now);
}

async function seedUserWithRole(db: AuthDatabase, roleKey: string, now: Date): Promise<{ userId: string; refreshToken: string }> {
  const userId = ulid();
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Seeded', 'hash', 'active', $3, $3)`,
    [userId, `${userId.toLowerCase()}@example.test`, now],
  );
  await db.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, $2)", [userId, roleKey]);
  const sessionId = ulid(); const refreshToken = ulid();
  await db.query("INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, created_at) VALUES ($1, $2, ARRAY['pwd','otp'], $3, $3, $3)", [sessionId, userId, now]);
  await db.query("INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [ulid(), hashSecretToken(refreshToken), sessionId, new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000), now]);
  return { userId, refreshToken };
}

async function bearer(target: TestApp, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${target.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken }) });
  expect(response.status).toBe(200);
  return (await response.json()) as { accessToken: string; refreshToken: string };
}

function authed(accessToken: string) { return { ...json, authorization: `Bearer ${accessToken}` }; }

async function boot(): Promise<{ db: AuthDatabase; now: Date }> {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const now = new Date();
  await ensureSigningKey(app, now);
  return { db, now };
}

describeWithPostgres("Admin HTTP endpoints", () => {
  it("invites, lists, reissues and revokes without ever leaking a secret field", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const tokens = await bearer(app!, admin.refreshToken);

    const created = await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: authed(tokens.accessToken), body: JSON.stringify({ email: "Nova.Pessoa@Example.Test", name: "Nova Pessoa", roleKeys: ["member"], directPermissions: [{ permission: "tag:delete", effect: "allow" }] }) });
    expect(created.status).toBe(201);
    const invite = (await created.json()) as { userId: string; inviteLink: string; expiresAt: string };
    expect(Object.keys(invite).sort()).toEqual(["expiresAt", "inviteLink", "userId"]);

    const duplicated = await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: authed(tokens.accessToken), body: JSON.stringify({ email: "nova.pessoa@example.test", name: "Outra", roleKeys: ["member"], directPermissions: [] }) });
    expect(duplicated.status).toBe(409);
    expect(await duplicated.json()).toEqual({ code: "email_already_exists" });

    const listed = await fetch(`${app!.url}/auth/admin/users?limit=50`, { headers: authed(tokens.accessToken) });
    expect(listed.status).toBe(200);
    const page = (await listed.json()) as { users: Record<string, unknown>[]; nextCursor: string | null };
    const invited = page.users.find((user) => user.id === invite.userId)!;
    expect(Object.keys(invited).sort()).toEqual(["createdAt", "directPermissions", "email", "id", "name", "roleKeys", "status", "updatedAt"]);
    expect(invited).toMatchObject({ email: "nova.pessoa@example.test", status: "pending_invite", roleKeys: ["member"] });
    const serialized = JSON.stringify(page);
    for (const forbidden of ["passwordHash", "password_hash", "phone", "tokenHash", "token_hash", "inviteLink", "recovery", "hash"]) {
      expect(serialized).not.toContain(forbidden);
    }

    const reissued = await fetch(`${app!.url}/auth/admin/users/${invite.userId}/invite/reissue`, { method: "POST", headers: authed(tokens.accessToken) });
    expect(reissued.status).toBe(200);
    const reissuedBody = (await reissued.json()) as { inviteLink: string };
    expect(reissuedBody.inviteLink).not.toBe(invite.inviteLink);

    // O link anterior morre no mesmo instante em que o novo nasce.
    const oldToken = new URL(invite.inviteLink).hash.replace(/^#token=/, "");
    const inspectOld = await fetch(`${app!.url}/auth/invites/inspect`, { method: "POST", headers: json, body: JSON.stringify({ token: decodeURIComponent(oldToken) }) });
    expect(inspectOld.status).toBe(401);

    const revoked = await fetch(`${app!.url}/auth/admin/users/${invite.userId}/invite`, { method: "DELETE", headers: authed(tokens.accessToken) });
    expect(revoked.status).toBe(204);
    const newToken = new URL(reissuedBody.inviteLink).hash.replace(/^#token=/, "");
    const inspectRevoked = await fetch(`${app!.url}/auth/invites/inspect`, { method: "POST", headers: json, body: JSON.stringify({ token: decodeURIComponent(newToken) }) });
    expect(inspectRevoked.status).toBe(401);
  });

  it("answers 401 without a bearer, 403 for a member and 404 for an unknown target", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const member = await seedUserWithRole(db, "member", now);
    const adminTokens = await bearer(app!, admin.refreshToken);
    const memberTokens = await bearer(app!, member.refreshToken);

    const anonymous = await fetch(`${app!.url}/auth/admin/users`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toBe("");

    const asMember = await fetch(`${app!.url}/auth/admin/users`, { headers: authed(memberTokens.accessToken) });
    expect(asMember.status).toBe(403);
    expect(await asMember.text()).toBe("");

    const missing = await fetch(`${app!.url}/auth/admin/users/${ulid()}/revoke-sessions`, { method: "POST", headers: authed(adminTokens.accessToken) });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ code: "not_found" });
  });

  it("refuses a super-admin token that carries a deny", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const other = await seedUserWithRole(db, "admin", now);
    await db.query("INSERT INTO user_permissions (user_id, permission, effect) VALUES ($1, 'event:delete', 'deny')", [admin.userId]);
    const tokens = await bearer(app!, admin.refreshToken);
    expect(other.userId).not.toBe(admin.userId);

    const response = await fetch(`${app!.url}/auth/admin/users`, { headers: authed(tokens.accessToken) });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
  });

  it("refuses to remove the last capable admin", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const tokens = await bearer(app!, admin.refreshToken);

    const lastAdmin = await fetch(`${app!.url}/auth/admin/users/${admin.userId}/status`, { method: "PATCH", headers: authed(tokens.accessToken), body: JSON.stringify({ status: "suspended" }) });
    expect(lastAdmin.status).toBe(409);
    expect(await lastAdmin.json()).toEqual({ code: "would_remove_last_admin" });
    expect((await db.query("SELECT status FROM users WHERE id=$1", [admin.userId])).rows[0].status).toBe("active");
  });

  it("shows a replaced access only on the next refresh, never in the token already issued", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const member = await seedUserWithRole(db, "member", now);
    const adminTokens = await bearer(app!, admin.refreshToken);
    const memberTokens = await bearer(app!, member.refreshToken);

    const replaced = await fetch(`${app!.url}/auth/admin/users/${member.userId}/access`, { method: "PUT", headers: authed(adminTokens.accessToken), body: JSON.stringify({ roleKeys: ["viewer"], directPermissions: [{ permission: "tag:create", effect: "deny" }] }) });
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toEqual({ userId: member.userId, roleKeys: ["viewer"], directPermissions: [{ permission: "tag:create", effect: "deny" }] });

    // O access token antigo continua dizendo "member" -- ele foi assinado antes.
    const before = await fetch(`${app!.url}/auth/me`, { headers: authed(memberTokens.accessToken) });
    expect(((await before.json()) as { roles: string[] }).roles).toEqual(["viewer"]);
    const payload = JSON.parse(Buffer.from(memberTokens.accessToken.split(".")[1]!, "base64url").toString()) as { roles: string[] };
    expect(payload.roles).toEqual(["member"]);

    const refreshed = await bearer(app!, memberTokens.refreshToken);
    const refreshedPayload = JSON.parse(Buffer.from(refreshed.accessToken.split(".")[1]!, "base64url").toString()) as { roles: string[]; denies: string[] };
    expect(refreshedPayload.roles).toEqual(["viewer"]);
    expect(refreshedPayload.denies).toEqual(["tag:create"]);

    // Suspender bloqueia o proximo refresh do membro.
    expect((await fetch(`${app!.url}/auth/admin/users/${member.userId}/status`, { method: "PATCH", headers: authed(adminTokens.accessToken), body: JSON.stringify({ status: "suspended" }) })).status).toBe(200);
    expect((await fetch(`${app!.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: refreshed.refreshToken }) })).status).toBe(401);
  });

  it("keeps the static users route ahead of the parameterised ones and rejects unknown fields", async () => {
    const { db, now } = await boot();
    const admin = await seedUserWithRole(db, "admin", now);
    const tokens = await bearer(app!, admin.refreshToken);

    // Se `users/:userId/...` capturasse a rota estatica, este GET nao existiria.
    expect((await fetch(`${app!.url}/auth/admin/users`, { headers: authed(tokens.accessToken) })).status).toBe(200);
    expect((await fetch(`${app!.url}/auth/admin/users?cursor=&limit=1`, { headers: authed(tokens.accessToken) })).status).toBe(400);

    for (const body of [
      { email: "a@example.test", name: "A", roleKeys: ["ghost"], directPermissions: [] },
      { email: "a@example.test", name: "A", roleKeys: ["member", "member"], directPermissions: [] },
      { email: "a@example.test", name: "A", roleKeys: [], directPermissions: [{ permission: "event:teleport", effect: "allow" }] },
      { email: "a@example.test", name: "A", roleKeys: [], directPermissions: [{ permission: "event:read", effect: "maybe" }] },
      { email: "a@example.test", name: "A", roleKeys: [], directPermissions: [], extra: true },
    ]) {
      const response = await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: authed(tokens.accessToken), body: JSON.stringify(body) });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "invalid_request" });
    }

    // O convidado nunca escolhe o proprio acesso: o aceite nao aceita o campo.
    const accept = await fetch(`${app!.url}/auth/invites/accept`, { method: "POST", headers: json, body: JSON.stringify({ token: "x", password: "y", phone: "+5511999999999", channel: "sms", roleKeys: ["admin"] }) });
    expect(accept.status).toBe(400);
  });
});
