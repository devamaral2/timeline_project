import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { ScryptPasswordHasher } from "../credentials/scrypt-password-hasher";
import { SigningKeyService } from "../crypto/signing-key.service";
import { verifyJwt } from "../crypto/jwt";
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

const PASSWORD = "Senha-De-Teste-123";
const json = { "content-type": "application/json" };
const login = (email: string, password: string) => fetch(`${app!.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email, password }) });

async function boot(): Promise<AuthDatabase> {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  await app.app.get(SigningKeyService).ensureActive(new Date());
  return app.app.get<AuthDatabase>(AUTH_DATABASE);
}

async function seedUser(db: AuthDatabase, email: string, status: string, withAdminRole = true): Promise<string> {
  const id = ulid();
  const hash = await new ScryptPasswordHasher().hash(PASSWORD);
  await db.query("INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES ($1, $2, 'Admin', $3, $4, now(), now())", [id, email, hash, status]);
  if (withAdminRole) await db.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'admin')", [id]);
  return id;
}

describeWithPostgres("POST /auth/login against Postgres", () => {
  it("logs in, verifies offline against the JWKS, reads /auth/me and refreshes", async () => {
    const db = await boot();
    const userId = await seedUser(db, "admin@example.test", "active");

    const response = await login("Admin@Example.test", PASSWORD);
    expect(response.status).toBe(200);
    const tokens = (await response.json()) as { accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number };
    expect(tokens.accessTokenExpiresInSeconds).toBe(900);

    const jwks = (await (await fetch(`${app!.url}/.well-known/jwks.json`)).json()) as { keys: Parameters<typeof verifyJwt>[1] };
    const claims = verifyJwt(tokens.accessToken, jwks.keys, "https://auth.example.test", "timeline-api", new Date(), ["user"]);
    expect(claims).toMatchObject({ sub: userId, token_use: "user", roles: ["admin"], perms: ["*:manage"] });

    const me = await fetch(`${app!.url}/auth/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ userId, email: "admin@example.test", sessionId: claims.sid });

    const session = (await db.query("SELECT amr, initial_ip_address IS NOT NULL AS has_ip FROM sessions WHERE id = $1", [claims.sid])).rows[0];
    expect(session).toEqual({ amr: ["pwd"], has_ip: true });

    const refreshed = await fetch(`${app!.url}/auth/token/refresh`, { method: "POST", headers: json, body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    expect(refreshed.status).toBe(200);
  });

  it("answers the same empty 401 for an unknown email, a wrong password and a non-active account", async () => {
    const db = await boot();
    await seedUser(db, "admin@example.test", "active");
    await seedUser(db, "pendente@example.test", "pending_invite");
    await seedUser(db, "suspenso@example.test", "suspended");

    for (const [email, password] of [["ninguem@example.test", PASSWORD], ["admin@example.test", "Senha-Errada-123"], ["pendente@example.test", PASSWORD], ["suspenso@example.test", PASSWORD]]) {
      const response = await login(email!, password!);
      expect([email, response.status, await response.text()]).toEqual([email, 401, ""]);
    }
    expect((await db.query("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count: 0 });
  });
});
