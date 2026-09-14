import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { ScryptPasswordHasher } from "../credentials/scrypt-password-hasher";
import { verifyJwt } from "../crypto/jwt";
import { SigningKeyService } from "../crypto/signing-key.service";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
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
const PASSWORD = "Senha-Do-Teste-2026";
const json = { "content-type": "application/json" };
const tokenOf = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;

let seq = 0;
async function seedActive(db: AuthDatabase, roleKey: "admin" | null): Promise<{ id: string; email: string }> {
  const id = ulid();
  seq += 1;
  const email = `user${seq}-${id.slice(-6).toLowerCase()}@example.test`;
  await db.query("INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES ($1, $2, 'Pessoa', $3, 'active', now(), now())", [id, email, await new ScryptPasswordHasher().hash(PASSWORD)]);
  if (roleKey) await db.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, $2)", [id, roleKey]);
  return { id, email };
}

async function loginAs(email: string): Promise<string> {
  const response = await fetch(`${app!.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function boot() {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  const keys = app.app.get(SigningKeyService);
  await keys.ensureActive(new Date());
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const admin = await seedActive(db, "admin");
  const subject = await seedActive(db, null);
  return { keys, db, admin, subject, adminToken: await loginAs(admin.email) };
}

const issue = (bearer: string, subjectUserId: string) =>
  fetch(`${app!.url}/auth/guests`, { method: "POST", headers: { ...json, authorization: `Bearer ${bearer}` }, body: JSON.stringify({ subjectUserId }) });

describeWithPostgres("guest links", () => {
  it("issues a one-hour read-only guest token over one active user, with no session or refresh token", async () => {
    const { keys, db, subject, adminToken } = await boot();
    const sessionsBefore = (await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count as number;
    const refreshBefore = (await db.query("SELECT count(*)::int AS count FROM refresh_tokens")).rows[0].count as number;

    const response = await issue(adminToken, subject.id);
    expect(response.status).toBe(201);
    const link = (await response.json()) as { guestId: string; url: string; expiresAt: string };
    expect(Object.keys(link).sort()).toEqual(["expiresAt", "guestId", "url"]);
    expect(link.url.startsWith("https://web.example.test/guest#token=")).toBe(true);

    const claims = verifyJwt(tokenOf(link.url), keys.publicJwks().keys, ISSUER, AUDIENCE, new Date(), ["guest"]);
    expect(claims).toMatchObject({ token_use: "guest", sub: link.guestId, subj: subject.id, perms: ["event:read", "tag:read"] });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(new Date(link.expiresAt).getTime()).toBe(claims.exp * 1000);

    const guest = (await db.query("SELECT name, status, email, phone, password_hash, observes_user_id FROM users WHERE id = $1", [link.guestId])).rows[0];
    expect(guest).toMatchObject({ status: "guest", email: null, phone: null, password_hash: null, observes_user_id: claims.subj });
    expect(guest.name).toMatch(/^guest_[0-9a-f]{8}$/);
    expect((await db.query("SELECT role_key FROM user_roles WHERE user_id = $1", [link.guestId])).rows).toEqual([{ role_key: "guest" }]);
    expect((await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count).toBe(sessionsBefore);
    expect((await db.query("SELECT count(*)::int AS count FROM refresh_tokens")).rows[0].count).toBe(refreshBefore);
  });

  it("stops verifying at 3600s past issuance, beyond the clock tolerance", async () => {
    const { keys, subject, adminToken } = await boot();
    const token = tokenOf(((await (await issue(adminToken, subject.id)).json()) as { url: string }).url);
    const jwks = keys.publicJwks().keys;
    const iat = (verifyJwt(token, jwks, ISSUER, AUDIENCE, new Date(), ["guest"])).iat;

    expect(() => verifyJwt(token, jwks, ISSUER, AUDIENCE, new Date((iat + 3600 + 30) * 1000), ["guest"])).not.toThrow();
    expect(() => verifyJwt(token, jwks, ISSUER, AUDIENCE, new Date((iat + 3600 + 31) * 1000), ["guest"])).toThrow(/lifetime/);
  });

  it("cannot be issued over a missing, placeholder, inactive or guest target", async () => {
    const { db, subject, adminToken } = await boot();
    const missing = await issue(adminToken, ulid());
    expect([missing.status, await missing.json()]).toEqual([404, { code: "not_found" }]);

    const pending = ulid();
    await db.query("INSERT INTO users (id, name, status, created_at, updated_at) VALUES ($1, 'admin_placeholder', 'pending_sign_up', now(), now())", [pending]);
    const inactive = await seedActive(db, null);
    await db.query("UPDATE users SET status = 'inactive' WHERE id = $1", [inactive.id]);
    const existingGuest = ((await (await issue(adminToken, subject.id)).json()) as { guestId: string }).guestId;

    for (const target of [pending, inactive.id, existingGuest]) {
      const response = await issue(adminToken, target);
      expect([target, response.status, await response.json()]).toEqual([target, 409, { code: "subject_not_eligible" }]);
    }
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE status = 'guest'")).rows[0]).toEqual({ count: 1 });
  });

  it("is refused by the refresh endpoint and by every user-token route", async () => {
    const { subject, adminToken } = await boot();
    const token = tokenOf(((await (await issue(adminToken, subject.id)).json()) as { url: string }).url);

    const refresh = await fetch(`${app!.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: token }) });
    expect(refresh.status).toBe(401);
    for (const [method, path] of [["GET", "/auth/me"], ["POST", "/auth/logout-all"], ["POST", "/auth/guests"]] as const) {
      const response = await fetch(`${app!.url}${path}`, { method, headers: { ...json, authorization: `Bearer ${token}` }, body: method === "GET" ? undefined : JSON.stringify({ subjectUserId: subject.id }) });
      expect([path, response.status]).toEqual([path, 403]);
    }
  });

  it("is admin only, and re-checks the issuer in the database rather than trusting the bearer", async () => {
    const { db, admin, subject, adminToken } = await boot();
    const plain = await seedActive(db, null);
    expect((await issue(await loginAs(plain.email), subject.id)).status).toBe(403);
    expect((await fetch(`${app!.url}/auth/guests`, { method: "POST", headers: json, body: JSON.stringify({ subjectUserId: subject.id }) })).status).toBe(401);

    // O bearer ainda diz *:manage, mas o papel foi retirado depois da emissao.
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [admin.id]);
    expect((await issue(adminToken, subject.id)).status).toBe(403);
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE status = 'guest'")).rows[0]).toEqual({ count: 0 });
  });

  it("revokes by deleting the guest row, its role going with it", async () => {
    const { db, admin, subject, adminToken } = await boot();
    const { guestId } = (await (await issue(adminToken, subject.id)).json()) as { guestId: string };
    const remove = (id: string) => fetch(`${app!.url}/auth/guests/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${adminToken}` } });

    expect((await remove(guestId)).status).toBe(204);
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE id = $1", [guestId])).rows[0]).toEqual({ count: 0 });
    expect((await db.query("SELECT count(*)::int AS count FROM user_roles WHERE user_id = $1", [guestId])).rows[0]).toEqual({ count: 0 });
    expect((await remove(guestId)).status).toBe(404);
    expect((await remove(admin.id)).status).toBe(404);
    expect((await db.query("SELECT status FROM users WHERE id = $1", [admin.id])).rows[0]).toEqual({ status: "active" });
  });
});
