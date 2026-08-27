import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { TestIntersectionObserver } from "@/test/setup";
import { TimelineList } from "./TimelineList";

const nowIso = "2026-08-19T15:00:00.000Z";

function anEvent(overrides: Partial<TimelineEventCardDto> = {}): TimelineEventCardDto {
  return {
    id: "event-1",
    type: "routine",
    accentColor: "blue",
    iconName: "clock",
    name: "Bloco de trabalho",
    description: "",
    startedAt: "2026-08-19T09:00:00-03:00",
    finishedAt: "2026-08-19T12:00:00-03:00",
    durationLabel: "3h 00m",
    tags: [],
    interruptions: [],
    ...overrides,
  };
}

function renderTimeline(initialEvents: TimelineEventCardDto[]) {
  return render(
    <TimelineList
      userId="user-1"
      initialEvents={initialEvents}
      todayKey="2026-08-19"
      nowIso={nowIso}
    />,
  );
}

/**
 * Cada chamada precisa de um Response novo: o body de um Response so pode ser
 * lido uma vez, entao reaproveitar a mesma instancia quebra da segunda janela
 * em diante.
 */
function respondWith(events: TimelineEventCardDto[]): void {
  vi.mocked(fetch).mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(events))),
  );
}

/** Simula o sentinel entrando na viewport no observer mais recente. */
async function scrollToTheEnd(): Promise<void> {
  const observer = TestIntersectionObserver.instances.at(-1);
  observer?.triggerIntersection();
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
}

beforeEach(() => {
  TestIntersectionObserver.instances.length = 0;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the events provided by the server", () => {
  renderTimeline([anEvent()]);

  // O mesmo dia aparece no layout vertical e no de colunas.
  expect(screen.getAllByRole("heading", { level: 3, name: "Bloco de trabalho" })).toHaveLength(2);
});

test("requests the next eight day window when the sentinel appears", async () => {
  respondWith([anEvent({ id: "older", startedAt: "2026-08-10T09:00:00-03:00" })]);
  renderTimeline([anEvent()]);

  await scrollToTheEnd();

  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
    "/api/events?userId=user-1&from=2026-08-04T03%3A00%3A00.000Z&to=2026-08-12T02%3A59%3A59.999Z",
  );
  await waitFor(() => {
    expect(screen.getAllByText(/10 de agosto de 2026|10 AGO/)).not.toHaveLength(0);
  });
});

test("stops fetching after three consecutive empty windows", async () => {
  respondWith([]);
  renderTimeline([anEvent()]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    TestIntersectionObserver.instances.at(-1)?.triggerIntersection();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(attempt + 1));
  }

  await waitFor(() => {
    expect(screen.getByText(/você chegou ao fim da timeline/i)).toBeInTheDocument();
  });

  TestIntersectionObserver.instances.at(-1)?.triggerIntersection();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
});

test("offers a retry when a window fails", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  renderTimeline([anEvent()]);

  await scrollToTheEnd();

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });
});

test("shows an empty state when there is nothing to render", async () => {
  respondWith([]);
  renderTimeline([]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    TestIntersectionObserver.instances.at(-1)?.triggerIntersection();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(attempt + 1));
  }

  await waitFor(() => {
    expect(screen.getByText(/nenhum evento registrado/i)).toBeInTheDocument();
  });
});
