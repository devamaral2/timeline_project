import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSessionForTests, signIn, signOut, useSessionState } from "./use-session";

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn(async () => false) }));
vi.mock("./refresh-session", () => ({ refreshSession }));

const USER = { userId: "user-1", name: "Ana", email: "ana@example.com" };

beforeEach(() => {
  resetSessionForTests();
  refreshSession.mockReset().mockResolvedValue(false);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("starts not ready and resolves the user from GET /api/session", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(USER)));

  const { result } = renderHook(() => useSessionState());

  expect(result.current).toEqual({ user: null, ready: false });
  await waitFor(() => expect(result.current).toEqual({ user: USER, ready: true }));
});

test("renews an expired access token before concluding nobody is signed in", async () => {
  refreshSession.mockResolvedValue(true);
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(USER)));

  const { result } = renderHook(() => useSessionState());

  await waitFor(() => expect(result.current).toEqual({ user: USER, ready: true }));
});

test("is ready with no user when there is no session", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

  const { result } = renderHook(() => useSessionState());

  await waitFor(() => expect(result.current).toEqual({ user: null, ready: true }));
});

test("signing in and out updates every subscriber", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  const { result } = renderHook(() => useSessionState());
  await waitFor(() => expect(result.current.ready).toBe(true));

  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(USER)));
  await act(async () => {
    await expect(signIn("ana@example.com", "secret")).resolves.toEqual({ ok: true, user: USER });
  });
  expect(result.current.user).toEqual(USER);

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await act(() => signOut());
  expect(result.current).toEqual({ user: null, ready: true });
  expect(fetch).toHaveBeenLastCalledWith("/api/session/logout", expect.objectContaining({ method: "POST" }));
});

test("sign in tells wrong credentials apart from rate limiting and outages", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(signIn("a@b.c", "x")).resolves.toEqual({ ok: false, reason: "invalid_credentials" });

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(signIn("a@b.c", "x")).resolves.toEqual({ ok: false, reason: "rate_limited" });

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(signIn("a@b.c", "x")).resolves.toEqual({ ok: false, reason: "unavailable" });

  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await expect(signIn("a@b.c", "x")).resolves.toEqual({ ok: false, reason: "unavailable" });
});
