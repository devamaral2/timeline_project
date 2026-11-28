import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { AuthenticationFailedError, RequiredDependencyUnavailableError } from "../common/errors";
import { RecordingAuthLogger } from "../common/logger";
import type { RequestContext } from "../common/request-context";
import { AUTH_SCHEMA_VERSION } from "../db/readiness";
import { authOpenApiDocument } from "../http/openapi";
import type { PublicSigningJwk } from "../domain/crypto/jwk";
import {
  createAuthHttpServer,
  type AuthHttpServer,
  type AuthHttpServerDependencies,
  type AuthRoute,
} from "./auth-server";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const LEAK_PROBE = "leak-probe-9d3f";
const publicJwk = {
  kty: "OKP",
  crv: "Ed25519",
  kid: "key-1",
  x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  use: "sig",
  alg: "EdDSA",
} as PublicSigningJwk;

function fakeDatabase(schemaVersion = AUTH_SCHEMA_VERSION): AuthHttpServerDependencies["database"] {
  return {
    async query(sql: string) {
      if (sql.includes("auth_schema_meta")) return { rows: [{ version: schemaVersion }] } as never;
      return { rows: [{ ok: 1 }], rowCount: 1 } as never;
    },
  } as AuthHttpServerDependencies["database"];
}

function dependencies(overrides: Partial<AuthHttpServerDependencies> = {}): AuthHttpServerDependencies {
  return {
    database: fakeDatabase(),
    signingKeyService: { publicJwks: () => ({ keys: [publicJwk] }) },
    ...overrides,
  };
}

describe("Auth Fastify server", () => {
  let server: AuthHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function start(routes: readonly AuthRoute[] = [], deps = dependencies()): Promise<string> {
    server = createAuthHttpServer({ dependencies: deps, logger: new RecordingAuthLogger(), routes });
    return server.listen(0, "127.0.0.1");
  }

  it("serves liveness and readiness against the composed database", async () => {
    const base = await start();

    const live = await fetch(`${base}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ok" });
  });

  it("answers readiness with the safe 503 body when the database is not ready", async () => {
    const base = await start([], dependencies({ database: fakeDatabase(AUTH_SCHEMA_VERSION - 1) }));

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ code: "service_unavailable" });
    expect(ready.headers.get("x-correlation-id")).toMatch(ULID);
  });

  it("preserves correlation id, IP and user agent in the request context", async () => {
    const route: AuthRoute = {
      method: "GET",
      path: "/testing/context",
      handler: async (request: FastifyRequest) => ({ context: request.authContext satisfies RequestContext }),
    };
    const base = await start([route]);

    const echoed = await fetch(`${base}/testing/context`, {
      headers: { "x-correlation-id": "trace-abc_123", "user-agent": "server-agent" },
    });
    expect(echoed.headers.get("x-correlation-id")).toBe("trace-abc_123");
    expect(await echoed.json()).toEqual({
      context: { correlationId: "trace-abc_123", ipAddress: "127.0.0.1", userAgent: "server-agent" },
    });

    for (const invalid of ["trace com espaço", "a".repeat(129), ""]) {
      const response = await fetch(`${base}/testing/context`, { headers: { "x-correlation-id": invalid } });
      const generated = response.headers.get("x-correlation-id");
      expect(generated).toMatch(ULID);
      expect(generated).not.toBe(invalid);
    }
  });

  it("maps domain errors to the safe contract without leaking internal reasons", async () => {
    const logger = new RecordingAuthLogger();
    const routes: AuthRoute[] = [
      { method: "GET", path: "/testing/authentication", handler: async () => { throw new AuthenticationFailedError(`unknown email ${LEAK_PROBE}`); } },
      { method: "GET", path: "/testing/dependency", handler: async () => { throw new RequiredDependencyUnavailableError(`provider down ${LEAK_PROBE}`); } },
      { method: "GET", path: "/testing/unknown", handler: async () => { throw new Error(`unexpected ${LEAK_PROBE}`); } },
    ];
    server = createAuthHttpServer({ dependencies: dependencies(), logger, routes });
    const base = await server.listen(0, "127.0.0.1");

    const unauthorized = await fetch(`${base}/testing/authentication`, { headers: { "x-correlation-id": "error-trace" } });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).toBe("");
    expect(unauthorized.headers.get("x-correlation-id")).toBe("error-trace");

    const unavailable = await fetch(`${base}/testing/dependency`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ code: "service_unavailable" });

    const unknown = await fetch(`${base}/testing/unknown`, { headers: { "x-correlation-id": "trace-500" } });
    expect(unknown.status).toBe(500);
    const text = await unknown.text();
    expect(text).not.toContain(LEAK_PROBE);
    expect(JSON.parse(text)).toEqual({ code: "internal_error", correlationId: "trace-500" });

    expect(logger.events.map((event) => event.status)).toEqual([401, 503, 500]);
  });

  it("delegates unmatched requests to the coexistence server", async () => {
    const base = await start();
    expect(server).toBeDefined();
    server?.setFallback((_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "not_found", servedBy: "nest" }));
    });

    const unknown = await fetch(`${base}/auth/nao-existe`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ code: "not_found", servedBy: "nest" });

    const live = await fetch(`${base}/health/live/`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
  });

  it("publishes the active key with the current ETag and answers 304", async () => {
    const base = await start();

    const first = await fetch(`${base}/.well-known/jwks.json`);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, max-age=300, stale-if-error=3600");
    const body = (await first.json()) as { keys: PublicSigningJwk[] };
    expect(body.keys).toHaveLength(1);
    expect((body.keys[0] as unknown as Record<string, unknown> | undefined)?.d).toBeUndefined();

    const etag = first.headers.get("etag");
    expect(etag).toBe(`"sha256-${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}"`);

    const notModified = await fetch(`${base}/.well-known/jwks.json`, { headers: { "if-none-match": etag ?? "" } });
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
    expect(notModified.headers.get("etag")).toBe(etag);
  });

  it("serves the OpenAPI document and the interactive reference without authentication", async () => {
    const base = await start();

    const document = await fetch(`${base}/openapi.json`);
    expect(document.status).toBe(200);
    expect(await document.json()).toEqual(authOpenApiDocument);

    const docs = await fetch(`${base}/docs`);
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    expect(docs.headers.get("x-correlation-id")).toMatch(ULID);
    const html = await docs.text();
    expect(html).toContain("Braid Auth API");
    expect(html).toContain("scalar");
  });
});
