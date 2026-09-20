import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import type { AuthDatabase } from "../db/client";
import { SigningKeyService } from "../features/authenticate-user/signing-key.service";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { hashSecretToken } from "../features/authenticate-user/secret-token";
import { SECURITY_POLICY } from "../config/security-policy";
import { AUTH_DATABASE } from "../db/tokens";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => { await app?.close(); app = undefined; await fixture?.close(); fixture = undefined; });

const json = { "content-type": "application/json" };
async function boot(): Promise<{ db: AuthDatabase; now: Date }> {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const now = new Date();
  await app.app.get(SigningKeyService).ensureActive(now, {
    correlationId: "admin-e2e", actorUserId: null, action: "key.created", targetType: "signing_key", targetId: null,
    result: "succeeded", reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: now,
  });
  return { db, now };
}

async function accessToken(db: AuthDatabase, roleKey: string, now: Date): Promise<string> {
  const userId = ulid();
  const sessionId = ulid();
  const refreshToken = ulid();
  await db.query("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES($1,$2,'Seeded','hash','active',$3,$3)", [userId, `${userId.toLowerCase()}@example.test`, now]);
  await db.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,$2)", [userId, roleKey]);
  await db.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,created_at) VALUES($1,$2,ARRAY['pwd'],$3,$3,$3)", [sessionId, userId, now]);
  await db.query("INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)", [ulid(), hashSecretToken(refreshToken), sessionId, new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000), now]);
  const response = await fetch(`${app!.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken }) });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

describeWithPostgres("Admin HTTP endpoints", () => {
  it("keeps invite creation and removes all other administration routes", async () => {
    const { db, now } = await boot();
    const token = await accessToken(db, "admin", now);
    const headers = { ...json, authorization: `Bearer ${token}` };
    const created = await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers, body: JSON.stringify({ email: "nova@example.test", name: "Nova", roleKeys: ["member"], directPermissions: [{ permission: "tag:delete", effect: "allow" }] }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ userId: expect.any(String), inviteLink: expect.any(String) });
    for (const [method, path] of [
      ["GET", "/auth/admin/users"], ["PATCH", "/auth/admin/users/id/status"],
      ["PUT", "/auth/admin/users/id/access"], ["POST", "/auth/admin/users/id/invite/reissue"],
      ["DELETE", "/auth/admin/users/id/invite"], ["POST", "/auth/admin/users/id/revoke-sessions"],
    ]) {
      expect((await fetch(`${app!.url}${path}`, { method, headers })).status).toBe(404);
    }
  });

  it("requires an admin and validates the retained invite contract", async () => {
    const { db, now } = await boot();
    const member = await accessToken(db, "member", now);
    const body = JSON.stringify({ email: "nova@example.test", name: "Nova", roleKeys: ["member"], directPermissions: [] });
    expect((await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: json, body })).status).toBe(401);
    expect((await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: { ...json, authorization: `Bearer ${member}` }, body })).status).toBe(403);
    const admin = await accessToken(db, "admin", now);
    expect((await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers: { ...json, authorization: `Bearer ${admin}` }, body: JSON.stringify({ ...JSON.parse(body), extra: true }) })).status).toBe(400);
  });

  it("rechecks the current admin role and session instead of trusting stale JWT grants", async () => {
    const { db, now } = await boot();
    const admin = await accessToken(db, "admin", now);
    const headers = { ...json, authorization: `Bearer ${admin}` };
    const body = JSON.stringify({ email: "nova@example.test", name: "Nova", roleKeys: ["member"], directPermissions: [] });
    await db.query("DELETE FROM user_roles WHERE role_key = 'admin'");
    expect((await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers, body })).status).toBe(403);
    await db.query("UPDATE sessions SET revoked_at = now(), ended_at = now() WHERE revoked_at IS NULL");
    expect((await fetch(`${app!.url}/auth/admin/invites`, { method: "POST", headers, body })).status).toBe(401);
  });

  it("authenticates the service and decides access using the current session", async () => {
    const { db, now } = await boot();
    const member = await accessToken(db, "member", now);
    const headers = { ...json, authorization: `Bearer ${member}`, "x-auth-service-key": "test-internal-service-key-32-bytes" };
    const own = { resource: "event", action: "read" };
    expect((await fetch(`${app!.url}/auth/internal/authorize`, { method: "POST", headers, body: JSON.stringify(own) })).status).toBe(200);
    expect((await fetch(`${app!.url}/auth/internal/authorize`, { method: "POST", headers: { ...headers, "x-auth-service-key": "wrong" }, body: JSON.stringify(own) })).status).toBe(401);
    expect((await fetch(`${app!.url}/auth/internal/authorize`, { method: "POST", headers, body: JSON.stringify({ ...own, targetUserId: ulid() }) })).status).toBe(403);
  });
});
