import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { refreshSession } from "./refresh-session";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("concurrent renewals share a single request, so the refresh token is never presented twice", async () => {
  let release: (response: Response) => void = () => {};
  vi.mocked(fetch).mockReturnValue(new Promise((resolve) => (release = resolve)));

  const first = refreshSession();
  const second = refreshSession();
  release(new Response(null, { status: 204 }));

  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/session/refresh", expect.objectContaining({ method: "POST" }));
});

test("a later renewal sends a new request", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

  await refreshSession();
  await refreshSession();

  expect(fetch).toHaveBeenCalledTimes(2);
});

test("reports failure instead of throwing", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await expect(refreshSession()).resolves.toBe(false);

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(refreshSession()).resolves.toBe(false);
});
