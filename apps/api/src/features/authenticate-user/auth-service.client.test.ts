import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  AuthServiceClient,
  AuthServiceForbiddenError,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
} from "./auth-service.client";

beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", "test-internal-service-key-32-bytes"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("forwards the bearer and capability to the internal authorization endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ userId: "user-1", sessionId: "session-1", email: "user@example.test", name: "Ana" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new AuthServiceClient("http://127.0.0.1:3002");

  await expect(client.authorize("Bearer test-token", "event", "read")).resolves.toEqual({
    userId: "user-1", sessionId: "session-1", email: "user@example.test", displayName: "Ana",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:3002/auth/internal/authorize",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token", "x-auth-service-key": "test-internal-service-key-32-bytes" }),
      body: JSON.stringify({ resource: "event", action: "read" }),
    }),
  );
});

test("never contacts auth without the private service key", async () => {
  vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(new AuthServiceClient("http://127.0.0.1:3002").authorize("Bearer token", "event", "read"))
    .rejects.toBeInstanceOf(AuthServiceRequestFailedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  [401, AuthServiceUnauthorizedError],
  [403, AuthServiceForbiddenError],
  [500, AuthServiceRequestFailedError],
])("maps auth status %i to a closed error", async (status, errorType) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
  await expect(new AuthServiceClient("http://127.0.0.1:3002").authorize("Bearer token", "event", "read"))
    .rejects.toBeInstanceOf(errorType);
});

test("closes access when the network call fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  await expect(new AuthServiceClient("http://127.0.0.1:3002").authorize("Bearer token", "event", "read"))
    .rejects.toBeInstanceOf(AuthServiceRequestFailedError);
});
