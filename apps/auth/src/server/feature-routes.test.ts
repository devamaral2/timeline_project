import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { RecordingAuthLogger } from "../common/logger";
import { AUTH_SCHEMA_VERSION } from "../db/readiness";
import type { LoginWithPasswordInput } from "../features/login-with-password/usecases/login-with-password.usecase";
import type { PublicSigningJwk } from "../domain/crypto/jwk";
import { buildUnsignedAccessTokenClaims, signJwt } from "../auth-core/security/jwt";
import type { Permission } from "../domain/rbac/permissions";
import {
  AccessDeniedError,
  AuthenticationFailedError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  SemanticInputError,
} from "../common/errors";
import {
  createAuthHttpServer,
  type AuthHttpServer,
  type AuthHttpServerDependencies,
} from "./auth-server";
import type { AuthRoute } from "./routes";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISSUER = "https://auth.example.test";
const AUDIENCE = "braid-api";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyJwk = publicKey.export({ format: "jwk" }) as { x: string };

function accessToken(permissions: Permission[] = ["task:read"]): string {
  const now = new Date();
  const claims = buildUnsignedAccessTokenClaims({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "user-1",
    sid: "session-1",
    perms: permissions,
    denies: [],
    roles: ["member"],
    amr: ["pwd"],
    auth_time: Math.floor(now.getTime() / 1000),
    now,
  });
  return signJwt({ ...claims, jti: "token-1" }, { kid: publicJwk.kid, privateKey });
}

function fakeDatabase(): AuthHttpServerDependencies["database"] {
  return {
    async query(sql: string) {
      if (sql.includes("auth_schema_meta")) return { rows: [{ version: AUTH_SCHEMA_VERSION }] } as never;
      return { rows: [{ ok: 1 }], rowCount: 1 } as never;
    },
  } as AuthHttpServerDependencies["database"];
}

const publicJwk = {
  kty: "OKP",
  crv: "Ed25519",
  kid: "key-1",
  x: publicKeyJwk.x,
  use: "sig",
  alg: "EdDSA",
} as PublicSigningJwk;

/**
 * As rotas de feature já migradas são servidas pelo Fastify, não pelo Nest.
 * O fallback responde 418: qualquer operação que voltar 418 prova que ainda
 * depende da coexistência.
 */
function fakeDependencies(
  overrides: Partial<AuthHttpServerDependencies> = {},
): AuthHttpServerDependencies {
  return {
    database: fakeDatabase(),
    signingKeyService: {
      publicJwks: () => ({ keys: [publicJwk] }),
      publicKeyFor: async (kid: string) => (kid === publicJwk.kid ? publicJwk : null),
    },
    env: { issuer: ISSUER, audience: AUDIENCE },
    authorizationService: {
      currentUser: async () => ({
        userId: "user-1",
        email: "pessoa@example.test",
        name: "Pessoa",
        sessionId: "session-1",
        roles: ["member"],
        permissions: ["task:read" as const],
        denies: [],
      }),
    },
    loginWithPassword: { execute: async () => ({ accessToken: "a", refreshToken: "r", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "2026-01-01T00:00:00.000Z" }) },
    refresh: { execute: async () => ({ accessToken: "a", refreshToken: "r", access: {} as never, session: {} as never }) },
    logout: { execute: async () => undefined },
    logoutAll: { execute: async () => undefined },
    currentUser: { execute: async () => ({ userId: "user-1", sessionId: "session-1" }) as never },
    inspectInvite: { execute: async () => ({ name: "Pessoa Convidada" }) as never },
    acceptInvite: { execute: async () => ({ accepted: true }) as never },
    createInvite: { execute: async () => ({ userId: "user-2", inviteLink: "https://web.example.test/convites/aceitar#token=x", expiresAt: "2026-01-01T00:00:00.000Z" }) as never },
    ...overrides,
  } as AuthHttpServerDependencies;
}

describe("Auth feature routes on Fastify", () => {
  let server: AuthHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function start(
    deps: AuthHttpServerDependencies,
    routes: readonly AuthRoute[] = [],
  ): Promise<string> {
    server = createAuthHttpServer({
      dependencies: deps,
      logger: new RecordingAuthLogger(),
      routes,
    });
    const base = await server.listen(0, "127.0.0.1");
    server.setFallback((_request, response) => {
      response.writeHead(418, { "content-type": "application/json" });
      response.end(JSON.stringify({ servedBy: "fallback" }));
    });
    return base;
  }

  const postJson = (base: string, path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  describe("public session operations", () => {
    it("serves login with 201, the session body and the request context", async () => {
      const loginExecute = vi.fn(async (_input: LoginWithPasswordInput) => ({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        accessTokenExpiresInSeconds: 900,
        refreshTokenExpiresAt: "2026-01-01T00:00:00.000Z",
      }));
      const base = await start(
        fakeDependencies({ loginWithPassword: { execute: loginExecute } }),
      );

      const response = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-correlation-id": "login-trace" },
        body: JSON.stringify({ email: "pessoa@example.test", password: "Senha-forte-42!" }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("x-correlation-id")).toBe("login-trace");
      expect(await response.json()).toEqual({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        accessTokenExpiresInSeconds: 900,
        refreshTokenExpiresAt: "2026-01-01T00:00:00.000Z",
      });
      expect(loginExecute).toHaveBeenCalledOnce();
      expect(loginExecute.mock.calls[0]?.[0]).toMatchObject({
        email: "pessoa@example.test",
        password: "Senha-forte-42!",
        context: { correlationId: "login-trace" },
      });
    });

    it("serves refresh with 200 and only the token pair", async () => {
      const refreshExecute = vi.fn(async () => ({
        accessToken: "access-2",
        refreshToken: "refresh-2",
        access: {},
        session: {},
      }));
      const base = await start(
        fakeDependencies({ refresh: { execute: refreshExecute as never } }),
      );

      const response = await postJson(base, "/auth/token/refresh", { refreshToken: "old-refresh" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" });
      expect(refreshExecute).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "old-refresh" }));
    });

    it("serves logout with an empty 204 and the presented token", async () => {
      const logoutExecute = vi.fn(async () => undefined);
      const base = await start(fakeDependencies({ logout: { execute: logoutExecute } }));

      const response = await postJson(base, "/auth/logout", { refreshToken: "old-refresh" });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.get("x-correlation-id")).toMatch(ULID);
      expect(logoutExecute).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: "old-refresh" }),
      );
    });

    it("keeps validation, content type and body limit on the Fastify routes", async () => {
      const base = await start(fakeDependencies());

      const invalid = await postJson(base, "/auth/login", { email: "pessoa@example.test" });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ code: "invalid_request" });

      const malformed = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{oops",
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ code: "invalid_request" });

      const unsupported = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      });
      expect(unsupported.status).toBe(400);
      expect(await unsupported.json()).toEqual({ code: "invalid_request" });

      const oversized = await postJson(base, "/auth/login", {
        email: "pessoa@example.test",
        password: "x".repeat(40 * 1024),
      });
      expect(oversized.status).toBe(413);
      expect(await oversized.json()).toEqual({ code: "payload_too_large" });
    });

    it("leaves unmatched operations to the coexistence fallback", async () => {
      const base = await start(fakeDependencies());

      const response = await fetch(`${base}/auth/nao-existe`);
      expect(response.status).toBe(418);
      expect(await response.json()).toEqual({ servedBy: "fallback" });
    });
  });

  describe("guarded session operations", () => {
    it("rejects /auth/me without a valid bearer, with an empty 401", async () => {
      const currentUser = vi.fn(async () => ({ userId: "user-1" }) as never);
      const base = await start(fakeDependencies({ currentUser: { execute: currentUser } }));

      const missing = await fetch(`${base}/auth/me`, { headers: { "x-correlation-id": "me-trace" } });
      expect(missing.status).toBe(401);
      expect(await missing.text()).toBe("");
      expect(missing.headers.get("x-correlation-id")).toBe("me-trace");

      const invalid = await fetch(`${base}/auth/me`, { headers: { authorization: "Bearer token-invalido" } });
      expect(invalid.status).toBe(401);
      expect(await invalid.text()).toBe("");
      expect(currentUser).not.toHaveBeenCalled();
    });

    it("serves /auth/me with the actor decoded from the bearer", async () => {
      const currentUser = vi.fn(async () => ({
        userId: "user-1",
        email: "pessoa@example.test",
        name: "Pessoa",
        sessionId: "session-1",
        roles: ["member"],
        permissions: ["task:read" as const],
        denies: [],
      }));
      const base = await start(fakeDependencies({ currentUser: { execute: currentUser } }));

      const response = await fetch(`${base}/auth/me`, {
        headers: { authorization: `Bearer ${accessToken()}` },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ userId: "user-1", roles: ["member"] });
      expect(currentUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", sessionId: "session-1" }),
      );
    });

    it("serves logout-all with an empty 204 for the authenticated actor", async () => {
      const logoutAll = vi.fn(async () => undefined);
      const base = await start(fakeDependencies({ logoutAll: { execute: logoutAll } }));

      const denied = await fetch(`${base}/auth/logout-all`, { method: "POST" });
      expect(denied.status).toBe(401);

      const response = await fetch(`${base}/auth/logout-all`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken()}` },
      });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(logoutAll).toHaveBeenCalledWith(
        expect.objectContaining({ actor: expect.objectContaining({ userId: "user-1" }) }),
      );
    });

    it("requires the whole superadmin for /auth/admin/invites", async () => {
      const createInvite = vi.fn(async () => ({
        userId: "user-2",
        inviteLink: "https://web.example.test/convites/aceitar#token=x",
        expiresAt: "2026-01-01T00:00:00.000Z",
      }));
      const base = await start(
        fakeDependencies({
          createInvite: { execute: createInvite as never },
          authorizationService: {
            currentUser: async () => ({
              userId: "user-1",
              email: "pessoa@example.test",
              name: "Pessoa",
              sessionId: "session-1",
              roles: ["member"],
              permissions: ["task:read" as const],
              denies: [],
            }),
          },
        }),
      );
      const token = accessToken();

      const unauthenticated = await fetch(`${base}/auth/admin/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(unauthenticated.status).toBe(401);
      expect(await unauthenticated.text()).toBe("");

      const forbidden = await fetch(`${base}/auth/admin/invites`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ email: "x@example.test", name: "X", roleKeys: [], directPermissions: [] }),
      });
      expect(forbidden.status).toBe(403);
      expect(await forbidden.text()).toBe("");
      expect(createInvite).not.toHaveBeenCalled();
    });

    it("creates the invite with 201 for a superadmin and validates after the guards", async () => {
      const createInvite = vi.fn(async () => ({
        userId: "user-2",
        inviteLink: "https://web.example.test/convites/aceitar#token=x",
        expiresAt: "2026-01-01T00:00:00.000Z",
      }));
      const base = await start(
        fakeDependencies({
          createInvite: { execute: createInvite as never },
          authorizationService: {
            currentUser: async () => ({
              userId: "user-1",
              email: "pessoa@example.test",
              name: "Pessoa",
              sessionId: "session-1",
              roles: ["admin"],
              permissions: ["*:manage" as const],
              denies: [],
            }),
          },
        }),
      );
      const authorization = `Bearer ${accessToken(["*:manage"])}`;

      const invalid = await fetch(`${base}/auth/admin/invites`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ email: "x@example.test" }),
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ code: "invalid_request" });
      expect(createInvite).not.toHaveBeenCalled();

      const created = await fetch(`${base}/auth/admin/invites`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ email: "x@example.test", name: "X", roleKeys: ["member"], directPermissions: [] }),
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({
        userId: "user-2",
        inviteLink: "https://web.example.test/convites/aceitar#token=x",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });
      expect(createInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ userId: "user-1" }),
          email: "x@example.test",
          roleKeys: ["member"],
        }),
      );
    });
  });

  describe("public invite operations", () => {
    it("inspects and accepts invites with the Nest status of 201", async () => {
      const inspectInvite = vi.fn(async () => ({
        name: "Pessoa Convidada",
        email: "p***@example.test",
        expiresAt: "2026-01-01T00:00:00.000Z",
      }));
      const acceptInvite = vi.fn(async () => ({ accepted: true as const }));
      const base = await start(
        fakeDependencies({
          inspectInvite: { execute: inspectInvite as never },
          acceptInvite: { execute: acceptInvite as never },
        }),
      );

      const inspection = await postJson(base, "/auth/invites/inspect", { token: "invite-token" });
      expect(inspection.status).toBe(201);
      expect(await inspection.json()).toEqual({
        name: "Pessoa Convidada",
        email: "p***@example.test",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });
      expect(inspectInvite).toHaveBeenCalledWith("invite-token");

      const accepted = await postJson(base, "/auth/invites/accept", {
        token: "invite-token",
        password: "Senha-forte-42!",
      });
      expect(accepted.status).toBe(201);
      expect(await accepted.json()).toEqual({ accepted: true });
      expect(acceptInvite).toHaveBeenCalledWith(
        expect.objectContaining({ inviteToken: "invite-token", password: "Senha-forte-42!" }),
      );
    });
  });

  describe("safe error contract on the Fastify routes", () => {
    const LEAK_PROBE = "leak-probe-9d3f";
    const raise = (kind: string): AuthRoute => ({
      method: "GET",
      path: `/testing/raise/${kind}`,
      handler: async () => {
        switch (kind) {
          case "authentication":
            throw new AuthenticationFailedError(`unknown email ${LEAK_PROBE}`);
          case "access":
            throw new AccessDeniedError(`missing permission ${LEAK_PROBE}`);
          case "rate-limit":
            throw new RateLimitedError(42.3, `too many tries ${LEAK_PROBE}`);
          case "semantic":
            throw new SemanticInputError("password_compromised");
          case "conflict":
            throw new ConflictError("would_remove_last_admin");
          case "not-found":
            throw new NotFoundError(`no such user ${LEAK_PROBE}`);
          default:
            throw new Error(`unhandled failure ${LEAK_PROBE}`);
        }
      },
    });

    it.each([
      ["authentication", 401, null, undefined],
      ["access", 403, null, undefined],
      ["rate-limit", 429, "43", undefined],
      ["semantic", 422, null, { code: "password_compromised" }],
      ["conflict", 409, null, { code: "would_remove_last_admin" }],
      ["not-found", 404, null, { code: "not_found" }],
    ] as const)("translates %s without leaking the internal reason", async (kind, status, retryAfter, body) => {
      const base = await start(fakeDependencies(), [raise(kind)]);

      const response = await fetch(`${base}/testing/raise/${kind}`, {
        headers: { "x-correlation-id": "error-trace" },
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("x-correlation-id")).toBe("error-trace");
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      const text = await response.text();
      expect(text).not.toContain(LEAK_PROBE);
      expect(body === undefined ? text : JSON.parse(text)).toEqual(body ?? "");
    });

    it("answers unknown failures with 500 internal_error and the correlation id", async () => {
      const base = await start(fakeDependencies(), [raise("unknown")]);

      const response = await fetch(`${base}/testing/raise/unknown`, {
        headers: { "x-correlation-id": "trace-500" },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get("x-correlation-id")).toBe("trace-500");
      const text = await response.text();
      expect(text).not.toContain(LEAK_PROBE);
      expect(JSON.parse(text)).toEqual({ code: "internal_error", correlationId: "trace-500" });
    });
  });
});
