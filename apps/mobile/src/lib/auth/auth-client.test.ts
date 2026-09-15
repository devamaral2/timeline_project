import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthRequestError, createAuthClient } from "./auth-client";

const client = createAuthClient("http://10.0.0.2:3002");

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

test("logs in against MOBILE_AUTH_URL and returns both tokens", async () => {
  vi.mocked(fetch).mockResolvedValue(
    json({ accessToken: "a1", refreshToken: "r1", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "x" }),
  );

  await expect(client.login("ana@example.com", "secret")).resolves.toEqual({ accessToken: "a1", refreshToken: "r1" });
  expect(fetch).toHaveBeenCalledWith(
    "http://10.0.0.2:3002/auth/login",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "ana@example.com", password: "secret" }) }),
  );
});

test("refreshes with the stored refresh token", async () => {
  vi.mocked(fetch).mockResolvedValue(json({ accessToken: "a2", refreshToken: "r2" }));

  await expect(client.refresh("r1")).resolves.toEqual({ accessToken: "a2", refreshToken: "r2" });
  expect(fetch).toHaveBeenCalledWith(
    "http://10.0.0.2:3002/auth/token/refresh",
    expect.objectContaining({ body: JSON.stringify({ refreshToken: "r1" }) }),
  );
});

test("logs out by revoking the refresh token", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

  await client.logout("r1");

  expect(fetch).toHaveBeenCalledWith(
    "http://10.0.0.2:3002/auth/logout",
    expect.objectContaining({ body: JSON.stringify({ refreshToken: "r1" }) }),
  );
});

test("reads the user with the access token", async () => {
  vi.mocked(fetch).mockResolvedValue(json({ userId: "u1", name: "Ana", email: null, sessionId: "s", roles: [] }));

  await expect(client.me("a1")).resolves.toEqual({ userId: "u1", name: "Ana", email: null });
  expect(fetch).toHaveBeenCalledWith(
    "http://10.0.0.2:3002/auth/me",
    expect.objectContaining({ headers: { Authorization: "Bearer a1" } }),
  );
});

test.each([
  [401, "invalid_credentials"],
  [429, "rate_limited"],
  [503, "unavailable"],
])("turns a %i into %s", async (status, reason) => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));

  await expect(client.login("a@b.c", "x")).rejects.toMatchObject({ reason, status });
});

test("a network failure is unavailable, not a bad credential", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("Network request failed"));

  const error = await client.refresh("r1").catch((thrown) => thrown);

  expect(error).toBeInstanceOf(AuthRequestError);
  expect((error as AuthRequestError).reason).toBe("unavailable");
});
