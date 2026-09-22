// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getSession, postLogin, postLogout, postRefresh } from "./session-routes";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AUTH_SERVICE_URL", "http://auth.test");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(path: string, init: { body?: unknown; cookies?: Record<string, string> } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.cookies) {
    headers.set("cookie", Object.entries(init.cookies).map(([name, value]) => `${name}=${value}`).join("; "));
  }
  return new NextRequest(`http://web.test${path}`, {
    method: init.body === undefined ? "GET" : "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ME = { userId: "user-1", name: "Ana", email: "ana@example.com", sessionId: "s1", roles: [], permissions: [], denies: [] };

test("login stores both tokens in httpOnly cookies and answers only the user", async () => {
  fetchMock
    .mockResolvedValueOnce(
      json({ accessToken: "access-1", refreshToken: "refresh-1", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z" }),
    )
    .mockResolvedValueOnce(json(ME));

  const response = await postLogin(request("/api/session/login", { body: { email: "ana@example.com", password: "secret" } }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ userId: "user-1", name: "Ana", email: "ana@example.com" });
  expect(fetchMock).toHaveBeenNthCalledWith(1, "http://auth.test/auth/login", expect.objectContaining({ method: "POST" }));
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "http://auth.test/auth/me",
    expect.objectContaining({ headers: { authorization: "Bearer access-1" } }),
  );

  const access = response.cookies.get("braid_access");
  const refresh = response.cookies.get("braid_refresh");
  expect(access).toMatchObject({ value: "access-1", httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
  expect(refresh).toMatchObject({ value: "refresh-1", httpOnly: true, path: "/api/session" });
});

test("login answers 401 without cookies when apps/auth rejects the credentials", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

  const response = await postLogin(request("/api/session/login", { body: { email: "ana@example.com", password: "wrong" } }));

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "invalid_credentials" });
  expect(response.cookies.get("braid_access")).toBeUndefined();
});

test("login forwards rate limiting with its Retry-After", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "30" } }));

  const response = await postLogin(request("/api/session/login", { body: { email: "ana@example.com", password: "x" } }));

  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
});

test("login answers 503 when apps/auth is unreachable", async () => {
  fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

  const response = await postLogin(request("/api/session/login", { body: { email: "ana@example.com", password: "x" } }));

  expect(response.status).toBe(503);
});

test("login rejects a body without email and password before calling apps/auth", async () => {
  const response = await postLogin(request("/api/session/login", { body: { email: "" } }));

  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("refresh rotates both cookies using the refresh cookie", async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const accessToken = `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
  fetchMock.mockResolvedValueOnce(json({ accessToken, refreshToken: "refresh-2" }));

  const response = await postRefresh(request("/api/session/refresh", { body: {}, cookies: { braid_refresh: "refresh-1" } }));

  expect(response.status).toBe(204);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://auth.test/auth/token/refresh",
    expect.objectContaining({ body: JSON.stringify({ refreshToken: "refresh-1" }) }),
  );
  expect(response.cookies.get("braid_access")?.value).toBe(accessToken);
  expect(response.cookies.get("braid_access")?.maxAge).toBeGreaterThan(590);
  expect(response.cookies.get("braid_refresh")?.value).toBe("refresh-2");
});

test("a rejected refresh clears the session cookies", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

  const response = await postRefresh(request("/api/session/refresh", { body: {}, cookies: { braid_refresh: "reused" } }));

  expect(response.status).toBe(401);
  expect(response.cookies.get("braid_access")?.value).toBe("");
  expect(response.cookies.get("braid_refresh")?.value).toBe("");
});

test("refresh keeps the cookies when apps/auth is down", async () => {
  fetchMock.mockRejectedValueOnce(new Error("timeout"));

  const response = await postRefresh(request("/api/session/refresh", { body: {}, cookies: { braid_refresh: "refresh-1" } }));

  expect(response.status).toBe(503);
  expect(response.cookies.get("braid_refresh")).toBeUndefined();
});

test("refresh without a refresh cookie answers 401 without calling apps/auth", async () => {
  const response = await postRefresh(request("/api/session/refresh", { body: {} }));

  expect(response.status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("logout revokes the refresh token and clears the cookies", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

  const response = await postLogout(request("/api/session/logout", { body: {}, cookies: { braid_refresh: "refresh-1" } }));

  expect(response.status).toBe(204);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://auth.test/auth/logout",
    expect.objectContaining({ body: JSON.stringify({ refreshToken: "refresh-1" }) }),
  );
  expect(response.cookies.get("braid_access")?.value).toBe("");
});

test("session answers the current user from the access cookie", async () => {
  fetchMock.mockResolvedValueOnce(json(ME));

  const response = await getSession(request("/api/session", { cookies: { braid_access: "access-1" } }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ userId: "user-1", name: "Ana", email: "ana@example.com" });
});

test("session answers 401 without an access cookie", async () => {
  const response = await getSession(request("/api/session"));

  expect(response.status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
