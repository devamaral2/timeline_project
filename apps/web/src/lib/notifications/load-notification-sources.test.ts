import { beforeEach, expect, test, vi } from "vitest";
import { createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));

vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { loadNotificationSources } = await import("./load-notification-sources");

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

beforeEach(() => {
  net.authedFetch.mockReset();
});

function installApi() {
  const api = createFakeApi({
    areas: [eventsArea],
    seed: {
      events: [
        // So na agenda: sem status, nao acompanhado.
        eventFixture({ id: "agenda-only", name: "Almoço", kind: "meal", status: undefined, startedAt: at(30), notifyOffsetsMinutes: [60] }),
        // Nas duas listas: agenda (tem horario, nao e longo) e acompanhado (tem status).
        eventFixture({ id: "both", name: "Revisar proposta", status: "todo", startedAt: at(60), notifyOffsetsMinutes: [15] }),
        // So na lista de acompanhados: evento longo, o aviso conta do prazo.
        eventFixture({ id: "long", name: "Entrega longa", status: "doing", longRunning: true, startedAt: at(-300), estimatedFinishAt: at(2 * 24 * 60), notifyOffsetsMinutes: [60] }),
      ],
    },
  });
  net.authedFetch.mockImplementation(api.authedFetch);
  return api;
}

test("reads the agenda window and the tracked list, and an event in both lists comes once", async () => {
  const api = installApi();

  const sources = await loadNotificationSources(NOW);

  expect(sources.map((source) => source.id).sort()).toEqual(["agenda-only", "both", "long"]);
  const paths = api.calls.map((call) => call.pathname);
  expect(paths).toContain("/api/tasks");
  expect(paths).toContain("/api/tasks/tracked");
});

test("the long-running event arrives with its deadline, so the notification can count from it", async () => {
  installApi();

  const sources = await loadNotificationSources(NOW);

  expect(sources.find((source) => source.id === "long")).toMatchObject({
    longRunning: true,
    estimatedFinishAt: at(2 * 24 * 60),
  });
});

test("a failed list drops only its own events; the other list still warns", async () => {
  const api = installApi();
  api.failNext("GET", "/api/tasks/tracked", 500);

  const sources = await loadNotificationSources(NOW);

  expect(sources.map((source) => source.id).sort()).toEqual(["agenda-only", "both"]);
});
