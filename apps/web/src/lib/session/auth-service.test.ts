import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { login, me } from "./auth-service";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("logs the auth status, correlation id and safe error code", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: "service_unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "x-correlation-id": "auth-correlation-1" },
  }));

  await login("admin@admin.com", "do-not-log-this-password");

  expect(console.error).toHaveBeenCalledWith("[AuthServiceClient] request failed", expect.objectContaining({
    path: "/auth/login",
    status: 503,
    authCorrelationId: "auth-correlation-1",
    code: "service_unavailable",
  }));
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("do-not-log-this-password");
});

test("logs network failures without logging credentials", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("connect ECONNREFUSED"));

  await me("do-not-log-this-token");

  expect(console.error).toHaveBeenCalledWith("[AuthServiceClient] request failed", expect.objectContaining({
    path: "/auth/me",
    error: { name: "Error", message: "connect ECONNREFUSED" },
  }));
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("do-not-log-this-token");
});
