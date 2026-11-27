import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANONYMOUS_CONTEXT } from "../../common/request-context";
import { CryptoSecretGenerator } from "../../common/secret-generator";
import { IssueDeviceKeyUseCase } from "../../features/device-keys/usecases/issue-device-key.usecase";
import { RevokeDeviceKeyUseCase } from "../../features/device-keys/usecases/revoke-device-key.usecase";
import { InMemoryDeviceKeyRepository } from "../../testing/in-memory-device-key.repository";
import { createTestApp, type TestApp } from "../../testing/create-test-app";
import { startFakeHttpServer, type FakeHttpServer } from "../../testing/fake-http-server";

const WORKER_ROUTE = "/api/transcription-worker/next";

describe("device key at the gateway", () => {
  let upstream: FakeHttpServer;
  let app: TestApp;
  let keys: InMemoryDeviceKeyRepository;
  let issued: { keyId: string; key: string };
  let revoke: RevokeDeviceKeyUseCase;

  beforeEach(async () => {
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    keys = new InMemoryDeviceKeyRepository();
    const users = {
      findByEmail: async () => ({ id: "user-1", email: "dono@example.test", name: "Dono", passwordHash: null, status: "active" as const, createdAt: new Date(), updatedAt: new Date() }),
    };
    const clock = { now: () => new Date() };
    issued = await new IssueDeviceKeyUseCase(users, keys, clock, new CryptoSecretGenerator())
      .execute({ email: "dono@example.test", label: "pc", context: ANONYMOUS_CONTEXT });
    revoke = new RevokeDeviceKeyUseCase(keys, clock);
    app = await createTestApp({ API_SERVICE_URL: upstream.url }, { deviceKeys: keys });
  });

  afterEach(async () => {
    await app.close();
    await upstream.close();
  });

  const call = (path: string, key?: string, headers: Record<string, string> = {}) =>
    fetch(`${app.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
      body: "{}",
    });

  it("forwards a valid key to the worker route with the owner identity and only the transcription permission", async () => {
    const response = await call(WORKER_ROUTE, issued.key);

    expect(response.status).toBe(200);
    expect(upstream.requests).toHaveLength(1);
    const headers = upstream.requests[0]?.headers;
    expect(upstream.requests[0]).toMatchObject({ method: "POST", path: WORKER_ROUTE });
    expect(headers?.["x-auth-gateway-key"]).toBe("test-internal-service-key-32-bytes");
    expect(headers?.["x-auth-user-id"]).toBe("user-1");
    expect(headers?.["x-auth-permissions"]).toBe("transcription:work");
    expect(headers?.["x-auth-session-id"]).toBeUndefined();
    expect(headers?.authorization).toBeUndefined();
  });

  it("does not let the caller inject identity headers of its own", async () => {
    await call(WORKER_ROUTE, issued.key, { "x-auth-user-id": "intruder", "x-auth-session-id": "fake", "x-auth-permissions": "other" });

    const headers = upstream.requests[0]?.headers;
    expect(headers?.["x-auth-user-id"]).toBe("user-1");
    expect(headers?.["x-auth-session-id"]).toBeUndefined();
    expect(headers?.["x-auth-permissions"]).toBe("transcription:work");
  });

  it("refuses a revoked key without reaching the API", async () => {
    await revoke.execute({ keyId: issued.keyId, context: ANONYMOUS_CONTEXT });

    expect((await call(WORKER_ROUTE, issued.key)).status).toBe(401);
    expect(upstream.requests).toHaveLength(0);
  });

  it("refuses an unknown key and a missing credential without reaching the API", async () => {
    expect((await call(WORKER_ROUTE, "bdk_desconhecida")).status).toBe(401);
    expect((await call(WORKER_ROUTE)).status).toBe(401);
    expect(upstream.requests).toHaveLength(0);
  });

  it("refuses a regular session token on the worker route", async () => {
    expect((await call(WORKER_ROUTE, "eyJhbGciOiJFUzI1NiIsImtpZCI6ImsifQ.e30.sig")).status).toBe(401);
    expect(upstream.requests).toHaveLength(0);
  });

  it.each(["/api/tasks", "/api/artifacts", "/api/requests", "/api/ai/chat", "/api/tasks/daily-reading"])(
    "never accepts the key on the existing route %s",
    async (path) => {
      const response = await call(path, issued.key);

      expect(response.status).toBe(401);
      expect(upstream.requests).toHaveLength(0);
    },
  );

  it("never accepts the key on the auth routes", async () => {
    expect((await call("/auth/logout-all", issued.key)).status).toBe(401);
    expect((await fetch(`${app.url}/auth/me`, { headers: { authorization: `Bearer ${issued.key}` } })).status).toBe(401);
  });
});
