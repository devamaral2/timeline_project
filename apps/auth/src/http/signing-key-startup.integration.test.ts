import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { ScryptPasswordHasher } from "../auth-core/password/scrypt-password-hasher";
import { verifyJwt } from "../auth-core/security/jwt";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../testing/postgres-test-database";

/**
 * O contrato operacional do startup: a chave de assinatura ativa é garantida
 * antes de o processo receber tráfego. Enquanto ela não existe, o readiness
 * recusa o deploy e o login não consegue emitir sessão.
 *
 * A ordem dos testes é a ordem do ciclo de vida (app sem chave -> garantia ->
 * app pronto). Cada um depende do anterior de propósito.
 */
describe("chave de assinatura no startup do Auth", () => {
  let database: PostgresTestDatabase;
  let admin: Client;
  let app: TestApp;
  let user: { id: string; email: string };

  const call = (path: string, init: RequestInit = {}) => fetch(`${app.url}${path}`, init);

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    admin = new Client({ connectionString: database.adminUrl });
    await admin.connect();
    const email = `startup-${crypto.randomUUID()}@example.test`;
    user = { id: `user-startup-${crypto.randomUUID()}`, email };
    const passwordHash = await new ScryptPasswordHasher().hash("Integration-password-42!");
    await admin.query(
      "INSERT INTO users (id,email,name,password_hash,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'active',now(),now())",
      [user.id, email, "Pessoa Startup", passwordHash],
    );
    // Sem `ensureActive`: é o estado de um processo que subiu mas ainda não
    // garantiu a chave, exatamente o que o readiness precisa barrar.
    app = await createTestApp({ AUTH_DATABASE_URL: database.runtimeUrl });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await database?.close();
  });

  const ensureActive = () =>
    app.core.signingKeyService.ensureActive(new Date(), {
      correlationId: "startup", actorUserId: null, action: "key.created",
      targetType: "signing_key", targetId: null, result: "succeeded",
      reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: new Date(),
    });

  it("recusa readiness e publica um JWKS vazio antes da chave ativa", async () => {
    const ready = await call("/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ code: "service_unavailable" });

    const jwks = await call("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    expect(await jwks.json()).toEqual({ keys: [] });
  });

  it("não emite sessão antes da chave ativa e não deixa sessão pela metade", async () => {
    const response = await call("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "Integration-password-42!" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error" });
    const sessions = await admin.query("SELECT id FROM sessions WHERE user_id=$1", [user.id]);
    expect(sessions.rows).toEqual([]);
  });

  it("garante a chave antes do listen, de forma idempotente", async () => {
    const first = await ensureActive();
    const second = await ensureActive();
    expect(second.kid).toBe(first.kid);

    const keys = await admin.query("SELECT kid FROM signing_keys WHERE status='active'");
    expect(keys.rows).toEqual([{ kid: first.kid }]);

    const ready = await call("/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ok" });
  });

  it("passa a assinar tokens verificáveis pela chave publicada", async () => {
    const login = await call("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "Integration-password-42!" }),
    });
    expect(login.status).toBe(201);
    const tokens = (await login.json()) as { accessToken: string };

    const jwks = (await (await call("/.well-known/jwks.json")).json()) as { keys: Parameters<typeof verifyJwt>[1] };
    const claims = verifyJwt(
      tokens.accessToken,
      jwks.keys,
      "https://auth.example.test",
      "timeline-api",
      new Date(),
    );
    expect(claims.sub).toBe(user.id);

    const me = await call("/auth/me", { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ userId: user.id, email: user.email });
  });
});
