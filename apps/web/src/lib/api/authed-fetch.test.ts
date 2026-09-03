import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dayEventsUrl } from "@repo/timeline";
import { ApiError, authedFetch } from "./authed-fetch";

const currentUser = { getIdToken: async () => "test-token" };
let signedIn: typeof currentUser | null = currentUser;

vi.mock("firebase/auth", () => ({
  getAuth: () => ({
    get currentUser() {
      return signedIn;
    },
  }),
}));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: () => ({}) }));

beforeEach(() => {
  signedIn = currentUser;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sends the firebase id token in the authorization header", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] })));

  await authedFetch(dayEventsUrl("2026-08-31"));

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/events?from="),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
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
    expect.objectContaining({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    }),
  );
});

test("answers 401 without touching the network while firebase has no user yet", async () => {
  signedIn = null;

  await expect(authedFetch("/api/events")).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});

test("carries the status of a failed response, and not only a message", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 503 }));

  const error = await authedFetch("/api/events").catch((thrown) => thrown);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(503);
});

test("reads nothing from a 204 — there is no body to parse", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

  await expect(authedFetch("/api/events/event-1", { method: "DELETE" })).resolves.toBeUndefined();
});
