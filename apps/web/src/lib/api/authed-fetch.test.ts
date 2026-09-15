import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dayEventsUrl } from "@repo/timeline";
import { ApiError, authedFetch } from "./authed-fetch";

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn(async () => true) }));
vi.mock("@/lib/session/refresh-session", () => ({ refreshSession }));

beforeEach(() => {
  refreshSession.mockReset().mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sends the session cookie and no bearer of its own", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] })));

  await authedFetch(dayEventsUrl("2026-08-31"));

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/events?from="),
    expect.objectContaining({ credentials: "same-origin" }),
  );
  const init = vi.mocked(fetch).mock.calls[0]?.[1];
  expect(JSON.stringify(init?.headers ?? {})).not.toContain("Authorization");
});

test("keeps the headers the caller asked for", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

  await authedFetch("/api/events/event-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  expect(fetch).toHaveBeenCalledWith(
    "/api/events/event-1",
    expect.objectContaining({ method: "PATCH", headers: { "Content-Type": "application/json" } }),
  );
});

test("renews the session once on a 401 and repeats the call", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: ["ok"] })));

  await expect(authedFetch("/api/events")).resolves.toEqual({ items: ["ok"] });
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("answers 401 when the session cannot be renewed", async () => {
  refreshSession.mockResolvedValue(false);
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

  await expect(authedFetch("/api/events")).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("carries the status of a failed response, and not only a message", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 503 }));

  const error = await authedFetch("/api/events").catch((thrown) => thrown);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(503);
  expect(refreshSession).not.toHaveBeenCalled();
});

test("reads nothing from a 204 — there is no body to parse", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

  await expect(authedFetch("/api/events/event-1", { method: "DELETE" })).resolves.toBeUndefined();
});
