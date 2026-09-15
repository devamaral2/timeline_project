import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dayEventsUrl } from "@repo/timeline";
import { ApiError, apiFetch, authedFetch } from "./client";

const API_HOST = "http://10.0.0.2:3001";

const session = vi.hoisted(() => ({
  getAccessToken: vi.fn(async (): Promise<string | null> => "test-token"),
  refresh: vi.fn(async (): Promise<string | null> => "renewed-token"),
}));

// O host e repetido literalmente porque a fabrica do `vi.mock` sobe para o topo
// do arquivo e nao enxerga a constante.
vi.mock("@/config/env", () => ({ env: { apiBaseUrl: "http://10.0.0.2:3001" } }));
vi.mock("@/lib/auth/session", () => ({ session }));

beforeEach(() => {
  session.getAccessToken.mockReset().mockResolvedValue("test-token");
  session.refresh.mockReset().mockResolvedValue("renewed-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("puts the host in front of the path — aqui nao ha rewrite do Next", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] })));

  await authedFetch(dayEventsUrl("2026-08-31"));

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`${API_HOST}/api/events?from=`),
    expect.anything(),
  );
});

test("sends the apps/auth access token when reading a day of the timeline", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] })));

  await authedFetch(dayEventsUrl("2026-08-31"));

  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
});

test("sends it when asking for tag suggestions too — /api/tags also authorizes by token", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([])));

  await authedFetch("/api/tags?query=foco&limit=6");

  expect(fetch).toHaveBeenCalledWith(
    `${API_HOST}/api/tags?query=foco&limit=6`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
});

test("keeps the headers the caller asked for", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ eventId: "event-1" })));

  await authedFetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  expect(fetch).toHaveBeenCalledWith(
    `${API_HOST}/api/events`,
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    }),
  );
});

test("renews the session once when the API still answers 401", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));

  await authedFetch("/api/events");

  expect(session.refresh).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenLastCalledWith(
    `${API_HOST}/api/events`,
    expect.objectContaining({ headers: { Authorization: "Bearer renewed-token" } }),
  );
});

test("answers 0 with a hint when the session cannot be renewed for lack of network", async () => {
  session.getAccessToken.mockRejectedValue(new Error("offline"));

  const error = await authedFetch("/api/events").catch((thrown) => thrown);

  expect((error as ApiError).status).toBe(0);
  expect((error as ApiError).message).toContain("MOBILE_AUTH_URL");
  expect(fetch).not.toHaveBeenCalled();
});

test("answers 401 without touching the network when nobody is signed in", async () => {
  session.getAccessToken.mockResolvedValue(null);

  await expect(authedFetch("/api/events")).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});

test("carries the status of a failed response, and not only a message", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 503 }));

  const error = await authedFetch("/api/events").catch((thrown) => thrown);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(503);
});

test("turns a network failure into status 0, with the hint that matters on a phone", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("Network request failed"));

  const error = await apiFetch("/api/health").catch((thrown) => thrown);

  expect((error as ApiError).status).toBe(0);
  expect((error as ApiError).message).toContain("MOBILE_API_URL");
});
