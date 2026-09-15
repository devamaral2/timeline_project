import { afterEach, expect, test, vi } from "vitest";
import {
  AuthServiceClient,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
} from "./auth-service.client";

afterEach(() => {
  vi.restoreAllMocks();
});

test("forwards the Authorization header to GET /auth/me and returns the actor", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ userId: "user-1", roles: ["member"], permissions: ["events:read"] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new AuthServiceClient("http://127.0.0.1:3002");

  const actor = await client.me("Bearer test-token");

  expect(actor).toEqual({ userId: "user-1", roles: ["member"], permissions: ["events:read"] });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:3002/auth/me",
    expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer test-token" },
    }),
  );
});

test("throws AuthServiceUnauthorizedError on a 401 from apps/auth", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  const client = new AuthServiceClient("http://127.0.0.1:3002");

  await expect(client.me("Bearer expired-token")).rejects.toBeInstanceOf(AuthServiceUnauthorizedError);
});

test("throws AuthServiceRequestFailedError on a non-401 error response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error", text: async () => "boom" }),
  );
  const client = new AuthServiceClient("http://127.0.0.1:3002");

  await expect(client.me("Bearer test-token")).rejects.toBeInstanceOf(AuthServiceRequestFailedError);
});

test("throws AuthServiceRequestFailedError when the network call itself fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("timeout")),
  );
  const client = new AuthServiceClient("http://127.0.0.1:3002");

  await expect(client.me("Bearer test-token")).rejects.toBeInstanceOf(AuthServiceRequestFailedError);
});
