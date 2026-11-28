import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SigningKeyService } from "./auth-core/security/signing-key.service";
import { PostgresUserRepository } from "./auth-core/persistence/postgres-user.repository";
import { getRuntimeEnv, type RuntimeEnv } from "./config/env";
import { composeAuthCore, startAuth, type RunningAuth } from "./composition-root";
import { createAuthTestDatabase, type AuthTestDatabase } from "./testing/sqlite-test-database";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function testEnv(databasePath: string): RuntimeEnv {
  return getRuntimeEnv({
    NODE_ENV: "test",
    AUTH_DATABASE_PATH: databasePath,
    AUTH_ISSUER: "https://auth.example.test",
    AUTH_PUBLIC_URL: "https://auth.example.test",
    AUTH_WEB_APP_URL: "https://web.example.test",
    AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    AUTH_INTERNAL_SERVICE_KEY: "test-internal-service-key-32-bytes",
  });
}

describe("Auth composition root", () => {
  let database: AuthTestDatabase;
  let runtime: RunningAuth;

  const call = (path: string, init: RequestInit = {}) => fetch(`${runtime.url}${path}`, init);

  beforeAll(async () => {
    database = await createAuthTestDatabase();
    runtime = await startAuth(testEnv(database.path), { port: 0, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await runtime?.close();
    await database?.close();
  });

  it("guarantees the active signing key before accepting traffic", async () => {
    const ready = await call("/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ok" });

    const jwks = await call("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    const body = (await jwks.json()) as { keys: Array<Record<string, unknown>> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA" });
  });

  it("builds one core instance and serves every route from the same Fastify server", async () => {
    expect(runtime.core.signingKeyService).toBeInstanceOf(SigningKeyService);
    expect(runtime.core.userRepository).toBeInstanceOf(PostgresUserRepository);
    expect(runtime.http.fastify).toBeDefined();

    // A feature e a infraestrutura que atendem a request vêm do mesmo grafo.
    const invalid = await call("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ code: "invalid_request" });
    expect(invalid.headers.get("x-correlation-id")).toMatch(ULID);

    const unknown = await call("/auth/nao-existe");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ code: "not_found" });
  });

  it("composes the core explicitly, without reflecting over modules", async () => {
    const env = testEnv(database.path);
    const core = await composeAuthCore(env);
    expect(core.env).toBe(env);
    expect(core.database).toBeDefined();
    expect(core.userRepository).toBeInstanceOf(PostgresUserRepository);
    expect(core.signingKeyService).toBeInstanceOf(SigningKeyService);
    await core.close();
  });
});
