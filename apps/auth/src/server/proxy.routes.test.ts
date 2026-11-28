import { afterEach, describe, expect, it } from "vitest";
import {
  DEVICE_PERMISSIONS_HEADER,
  TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES,
  TRANSCRIPTION_WORK_PERMISSION,
} from "@repo/contracts/device-key";
import type { AccessRequest } from "../auth-core/security/authorization.service";
import { signJwt, type AccessTokenClaims } from "../auth-core/security/jwt";
import { AccessDeniedError } from "../common/errors";
import { RecordingAuthLogger } from "../common/logger";
import { SECURITY_POLICY } from "../config/security-policy";
import { AUTH_SCHEMA_VERSION } from "../db/readiness";
import type { DeviceKeyIdentity } from "../domain/device-keys/device-key";
import { generateSigningKey, privateKeyFromPem } from "../domain/crypto/signing-key";
import { startFakeHttpServer, type FakeHttpServer } from "../testing/fake-http-server";
import { createAuthHttpServer, type AuthHttpServer, type AuthHttpServerDependencies } from "./auth-server";

const ISSUER = "https://auth.example.test";
const AUDIENCE = "timeline-api";

const key = generateSigningKey();
const privateKey = privateKeyFromPem(key.privateKeyPem);

function accessToken(overrides: Partial<AccessTokenClaims> = {}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: "user-1",
      sid: "session-1",
      jti: "token-1",
      iat: issuedAt,
      exp: issuedAt + 900,
      perms: ["task:read", "task:create"],
      denies: [],
      roles: ["member"],
      amr: ["pwd"],
      auth_time: issuedAt,
      ...overrides,
    },
    { kid: key.kid, privateKey },
  );
}

const owner: DeviceKeyIdentity = {
  keyId: "device-key-1",
  userId: "owner-1",
  permission: TRANSCRIPTION_WORK_PERMISSION,
};

function fakeDatabase(): AuthHttpServerDependencies["database"] {
  return {
    async query(sql: string) {
      if (sql.includes("auth_schema_meta")) return { rows: [{ version: AUTH_SCHEMA_VERSION }] } as never;
      return { rows: [{ ok: 1 }], rowCount: 1 } as never;
    },
  } as AuthHttpServerDependencies["database"];
}

interface ProxyServer {
  readonly server: AuthHttpServer;
  readonly base: string;
  readonly authorized: AccessRequest[];
}

/** As famílias fora do proxy existem para o tipo; o proxy não as aciona. */
function serverDependencies(overrides: Partial<AuthHttpServerDependencies> = {}): AuthHttpServerDependencies {
  return {
    database: fakeDatabase(),
    signingKeyService: {
      publicJwks: () => ({ keys: [key.publicJwk] }),
      publicKeyFor: async (kid: string) => (kid === key.kid ? key.publicJwk : null),
    },
    env: { issuer: ISSUER, audience: AUDIENCE },
    authorizationService: { currentUser: async () => { throw new Error("unexpected currentUser"); } },
    loginWithPassword: { execute: async () => { throw new Error("unexpected login"); } },
    refresh: { execute: async () => { throw new Error("unexpected refresh"); } },
    logout: { execute: async () => { throw new Error("unexpected logout"); } },
    logoutAll: { execute: async () => { throw new Error("unexpected logoutAll"); } },
    currentUser: { execute: async () => { throw new Error("unexpected currentUser usecase"); } },
    inspectInvite: { execute: async () => { throw new Error("unexpected inspectInvite"); } },
    acceptInvite: { execute: async () => { throw new Error("unexpected acceptInvite"); } },
    createInvite: { execute: async () => { throw new Error("unexpected createInvite"); } },
    ...overrides,
  } as AuthHttpServerDependencies;
}

async function startProxyServer(input: {
  apiServiceUrl: string;
  authorize?: (request: AccessRequest) => Promise<void>;
  deviceKey?: DeviceKeyIdentity | null;
}): Promise<ProxyServer> {
  const authorized: AccessRequest[] = [];
  const server = createAuthHttpServer({
    dependencies: serverDependencies({
      proxy: {
        env: { apiServiceUrl: input.apiServiceUrl, internalServiceKey: "gateway-key", issuer: ISSUER, audience: AUDIENCE },
        authorization: {
          async execute(request) {
            authorized.push(request);
            await input.authorize?.(request);
            return { userId: request.userId, sessionId: request.sessionId, email: "", name: "" };
          },
        },
        signingKeyService: {
          publicKeyFor: async (kid: string) => (kid === key.kid ? key.publicJwk : null),
        },
        deviceKeyAuthenticator: {
          async execute(value) {
            return input.deviceKey && value === "bdk_valid" ? input.deviceKey : null;
          },
        },
      },
    }),
    logger: new RecordingAuthLogger(),
  });
  const base = await server.listen(0, "127.0.0.1");
  return { server, base, authorized };
}

function bodyOf(field: string, bytes: number): string {
  const overhead = Buffer.byteLength(JSON.stringify({ [field]: "" }));
  return JSON.stringify({ [field]: "a".repeat(bytes - overhead) });
}

describe("proxy Fastify: chave de dispositivo, bearer e limites", () => {
  let upstream: FakeHttpServer | undefined;
  let proxy: ProxyServer | undefined;

  afterEach(async () => {
    await proxy?.server.close();
    proxy = undefined;
    await upstream?.close();
    upstream = undefined;
  });

  it("serve a chave de dispositivo antes do proxy geral e encaminha só a identidade validada", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url, deviceKey: owner });

    const response = await fetch(`${proxy.base}/api/transcription-worker/next`, {
      method: "POST",
      headers: {
        authorization: "Bearer bdk_valid",
        "content-type": "application/json",
        "x-auth-user-id": "intruder",
        "x-auth-session-id": "forged",
        "x-auth-permissions": "other",
      },
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(proxy.authorized).toEqual([]);
    expect(upstream.requests).toHaveLength(1);
    const forwarded = upstream.requests[0];
    expect(forwarded).toMatchObject({ method: "POST", path: "/api/transcription-worker/next", body: "{}" });
    expect(forwarded?.headers["x-auth-gateway-key"]).toBe("gateway-key");
    expect(forwarded?.headers["x-auth-user-id"]).toBe("owner-1");
    expect(forwarded?.headers[DEVICE_PERMISSIONS_HEADER]).toBe(TRANSCRIPTION_WORK_PERMISSION);
    expect(forwarded?.headers["x-auth-device-key-id"]).toBe("device-key-1");
    expect(forwarded?.headers["x-auth-session-id"]).toBeUndefined();
    expect(forwarded?.headers.authorization).toBeUndefined();
  });

  it("recusa sessão comum na porta da chave e a chave na porta da sessão", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url, deviceKey: owner });

    const sessionOnDevice = await fetch(`${proxy.base}/api/transcription-worker/next`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken()}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(sessionOnDevice.status).toBe(401);
    expect(await sessionOnDevice.text()).toBe("");

    const deviceOnGeneral = await fetch(`${proxy.base}/api/tasks`, {
      method: "POST",
      headers: { authorization: "Bearer bdk_valid", "content-type": "application/json" },
      body: "{}",
    });
    expect(deviceOnGeneral.status).toBe(401);
    expect(await deviceOnGeneral.text()).toBe("");

    expect(upstream.requests).toEqual([]);
    expect(proxy.authorized).toEqual([]);
  });

  it("autoriza antes de encaminhar, remove identidades forjadas e preserva status, headers, corpo e query", async () => {
    upstream = await startFakeHttpServer(() => ({
      status: 201,
      body: "created",
      headers: { "content-type": "application/problem+json", "x-upstream": "yes" },
    }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url });

    const response = await fetch(`${proxy.base}/api/artifacts?taskId=t1&tagId=g1`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken()}`,
        "content-type": "application/json",
        "x-auth-user-id": "intruder",
        "x-auth-session-id": "forged",
        "x-auth-permissions": "*:manage",
        "x-auth-gateway-key": "forged-key",
        "x-custom": "preserved",
      },
      body: JSON.stringify({ title: "Nota" }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("x-upstream")).toBe("yes");
    expect(await response.text()).toBe("created");
    expect(proxy.authorized).toEqual([
      { userId: "user-1", sessionId: "session-1", resource: "artifact", action: "create", targetUserId: undefined },
    ]);

    expect(upstream.requests).toHaveLength(1);
    const forwarded = upstream.requests[0];
    expect(forwarded).toMatchObject({
      method: "POST",
      path: "/api/artifacts?taskId=t1&tagId=g1",
      body: JSON.stringify({ title: "Nota" }),
    });
    expect(forwarded?.headers["x-auth-gateway-key"]).toBe("gateway-key");
    expect(forwarded?.headers["x-auth-user-id"]).toBe("user-1");
    expect(forwarded?.headers["x-auth-session-id"]).toBe("session-1");
    expect(forwarded?.headers["x-auth-permissions"]).toBeUndefined();
    expect(forwarded?.headers["x-custom"]).toBe("preserved");
    expect(forwarded?.headers.authorization).toBeUndefined();
  });

  it("nega com 403 vazio antes de tocar o upstream e lê o usuário alvo do corpo do agente", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    proxy = await startProxyServer({
      apiServiceUrl: upstream.url,
      authorize: async () => {
        throw new AccessDeniedError("denied");
      },
    });

    const denied = await fetch(`${proxy.base}/api/requests`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-2", text: "oi" }),
    });

    expect(denied.status).toBe(403);
    expect(await denied.text()).toBe("");
    expect(upstream.requests).toEqual([]);
    expect(proxy.authorized).toEqual([
      { userId: "user-1", sessionId: "session-1", resource: "agent", action: "execute", targetUserId: "user-2" },
    ]);
  });

  it("responde 500 sem policy para caminho fora do contrato, sem tocar o upstream", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url });

    const response = await fetch(`${proxy.base}/api/desconhecido`, {
      headers: { authorization: `Bearer ${accessToken()}`, "x-correlation-id": "proxy-policy" },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("x-correlation-id")).toBe("proxy-policy");
    expect(await response.json()).toEqual({ code: "internal_error", correlationId: "proxy-policy" });
    expect(upstream.requests).toEqual([]);
  });

  it("trata indisponibilidade do upstream como 500, nunca como falha de autenticação", async () => {
    const deadUpstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    const deadUrl = deadUpstream.url;
    await deadUpstream.close();
    proxy = await startProxyServer({ apiServiceUrl: deadUrl });

    const response = await fetch(`${proxy.base}/api/tasks`, {
      headers: { authorization: `Bearer ${accessToken()}`, "x-correlation-id": "upstream-down" },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("x-correlation-id")).toBe("upstream-down");
    expect(await response.json()).toEqual({ code: "internal_error", correlationId: "upstream-down" });
  });

  it("recusa JSON malformado com 400 invalid_request antes da autenticação", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url });

    const response = await fetch(`${proxy.base}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_request" });
    expect(upstream.requests).toEqual([]);
  });

  describe("limites de corpo", () => {
    it("aceita na Leitura diária até o teto e recusa um byte acima", async () => {
      proxy = await startProxyServer({ apiServiceUrl: "http://127.0.0.1:9" });

      const atLimit = await fetch(`${proxy.base}/api/tasks/daily-reading`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("markdown", SECURITY_POLICY.maxLargeRequestBodyBytes),
      });
      expect(atLimit.status).toBe(401);

      const aboveLimit = await fetch(`${proxy.base}/api/tasks/daily-reading`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("markdown", SECURITY_POLICY.maxLargeRequestBodyBytes + 1),
      });
      expect(aboveLimit.status).toBe(413);
      expect(await aboveLimit.json()).toEqual({ code: "payload_too_large" });
    });

    it("mantém o limite comum nas demais rotas do proxy", async () => {
      proxy = await startProxyServer({ apiServiceUrl: "http://127.0.0.1:9" });

      const common = await fetch(`${proxy.base}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("title", 200 * 1024),
      });
      expect(common.status).toBe(413);
      expect(await common.json()).toEqual({ code: "payload_too_large" });

      const device = await fetch(`${proxy.base}/api/transcription-worker/next`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("title", 200 * 1024),
      });
      expect(device.status).toBe(413);
    });

    it("aceita na entrega da transcrição até o teto e recusa um byte acima", async () => {
      proxy = await startProxyServer({ apiServiceUrl: "http://127.0.0.1:9" });

      const atLimit = await fetch(`${proxy.base}/api/transcription-worker/deliver`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("result", TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES),
      });
      expect(atLimit.status).toBe(401);

      const aboveLimit = await fetch(`${proxy.base}/api/transcription-worker/deliver`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyOf("result", TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES + 1),
      });
      expect(aboveLimit.status).toBe(413);
      expect(await aboveLimit.json()).toEqual({ code: "payload_too_large" });
    });
  });

  it("mantém o correlation id também nas respostas do proxy", async () => {
    upstream = await startFakeHttpServer(() => ({ status: 204, body: "" }));
    proxy = await startProxyServer({ apiServiceUrl: upstream.url });

    const response = await fetch(`${proxy.base}/api/tasks/t1`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken()}`, "x-correlation-id": "proxy-trace" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("x-correlation-id")).toBe("proxy-trace");
  });
});
