import { beforeEach, expect, test, vi } from "vitest";
import { AuthRequestError, type AuthClient } from "./auth-client";
import { createSessionStore, secondsLeft } from "./session-store";
import type { StoredSession, TokenStorage } from "./token-storage-types";

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const USER = { userId: "user-1", name: "Ana", email: "ana@example.com" };

function jwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: NOW / 1000 + expiresInSeconds })).toString("base64url");
  return `header.${payload}.signature`;
}

let stored: StoredSession | null;
let storage: TokenStorage;
let client: { [K in keyof AuthClient]: ReturnType<typeof vi.fn> };

beforeEach(() => {
  stored = null;
  storage = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (session) => {
      stored = session;
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  client = { login: vi.fn(), refresh: vi.fn(), logout: vi.fn(async () => {}), me: vi.fn() };
});

function store() {
  return createSessionStore({ client: client as unknown as AuthClient, storage, now: () => NOW });
}

test("restores a stored session without asking the network", async () => {
  stored = { accessToken: jwt(600), refreshToken: "r1", user: USER };
  const session = store();

  expect(session.getState()).toEqual({ user: null, ready: false });
  await session.restore();

  expect(session.getState()).toEqual({ user: USER, ready: true });
  expect(client.refresh).not.toHaveBeenCalled();
});

test("signs in, reads the user and persists both tokens", async () => {
  const access = jwt(900);
  client.login.mockResolvedValue({ accessToken: access, refreshToken: "r1" });
  client.me.mockResolvedValue(USER);
  const session = store();
  const listener = vi.fn();
  session.subscribe(listener);

  await expect(session.signIn("ana@example.com", "secret")).resolves.toEqual({ ok: true, user: USER });

  expect(client.me).toHaveBeenCalledWith(access);
  expect(stored).toEqual({ accessToken: access, refreshToken: "r1", user: USER });
  expect(session.getState()).toEqual({ user: USER, ready: true });
  expect(listener).toHaveBeenCalled();
});

test("reports why a sign in failed and stores nothing", async () => {
  client.login.mockRejectedValue(new AuthRequestError("rate_limited", 429));

  await expect(store().signIn("a@b.c", "x")).resolves.toEqual({ ok: false, reason: "rate_limited" });
  expect(storage.save).not.toHaveBeenCalled();
});

test("hands out a valid access token as is", async () => {
  const access = jwt(600);
  stored = { accessToken: access, refreshToken: "r1", user: USER };

  await expect(store().getAccessToken()).resolves.toBe(access);
  expect(client.refresh).not.toHaveBeenCalled();
});

test("renews an expired access token and persists the rotated refresh token", async () => {
  stored = { accessToken: jwt(10), refreshToken: "r1", user: USER };
  const renewed = jwt(900);
  client.refresh.mockResolvedValue({ accessToken: renewed, refreshToken: "r2" });

  await expect(store().getAccessToken()).resolves.toBe(renewed);
  expect(client.refresh).toHaveBeenCalledWith("r1");
  expect(stored).toEqual({ accessToken: renewed, refreshToken: "r2", user: USER });
});

test("concurrent calls share one renewal, so the refresh token is never presented twice", async () => {
  stored = { accessToken: jwt(-1), refreshToken: "r1", user: USER };
  const renewed = jwt(900);
  client.refresh.mockResolvedValue({ accessToken: renewed, refreshToken: "r2" });
  const session = store();

  const tokens = await Promise.all([session.getAccessToken(), session.getAccessToken(), session.refresh()]);

  expect(tokens).toEqual([renewed, renewed, renewed]);
  expect(client.refresh).toHaveBeenCalledTimes(1);
});

test("a refused renewal ends the session", async () => {
  stored = { accessToken: jwt(-1), refreshToken: "reused", user: USER };
  client.refresh.mockRejectedValue(new AuthRequestError("invalid_credentials", 401));
  const session = store();

  await expect(session.getAccessToken()).resolves.toBeNull();
  expect(session.getState()).toEqual({ user: null, ready: true });
  expect(stored).toBeNull();
});

test("a renewal without network keeps the user signed in", async () => {
  stored = { accessToken: jwt(-1), refreshToken: "r1", user: USER };
  client.refresh.mockRejectedValue(new AuthRequestError("unavailable", 0));
  const session = store();

  await expect(session.getAccessToken()).rejects.toBeInstanceOf(AuthRequestError);
  expect(session.getState().user).toEqual(USER);
  expect(stored).not.toBeNull();
});

test("signing out clears the device even when apps/auth is unreachable", async () => {
  stored = { accessToken: jwt(600), refreshToken: "r1", user: USER };
  client.logout.mockRejectedValue(new AuthRequestError("unavailable", 0));
  const session = store();
  await session.restore();

  await session.signOut();

  expect(client.logout).toHaveBeenCalledWith("r1");
  expect(stored).toBeNull();
  expect(session.getState()).toEqual({ user: null, ready: true });
  await expect(session.getAccessToken()).resolves.toBeNull();
});

test("an unreadable token counts as expired", () => {
  expect(secondsLeft("not-a-jwt", NOW)).toBe(0);
  expect(secondsLeft(jwt(120), NOW)).toBe(120);
});
