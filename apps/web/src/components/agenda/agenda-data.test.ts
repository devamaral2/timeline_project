import type { EventCardDto } from "@repo/contracts";
import { expect, test } from "vitest";
import { type AgendaCard, agendaEventFromCard, agendaEventsByDay } from "./agenda-data";

function card(overrides: Partial<EventCardDto> = {}): EventCardDto {
  return {
    id: "event-1",
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: "Planejar o dia",
    description: "",
    location: "",
    startedAt: "2026-09-14T12:00:00.000Z",
    estimatedFinishAt: "2026-09-14T12:30:00.000Z",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: ["pessoal"],
    artifactTypes: [],
    previousEventIds: [],
    revision: 1,
    ...overrides,
  };
}

test("maps a card to the grid model, keeping the card for the row", () => {
  const source = card();
  expect(agendaEventFromCard(source as AgendaCard)).toMatchObject({
    id: "event-1",
    time: "09:00 — 09:30",
    minutes: 30,
    tags: ["pessoal"],
    card: source,
  });
});

test("the grid closes at the planned end, so a real conclusion does not move the event", () => {
  const grouped = agendaEventsByDay([
    card({ finishedAt: "2026-09-14T13:00:00.000Z", status: "done" }),
  ]);

  expect(grouped["2026-09-14"]?.[0]).toMatchObject({ minutes: 30, time: "09:00 — 09:30" });
});

test("shows only the start time for cards without a planned end, and sorts each day by the clock", () => {
  const grouped = agendaEventsByDay([
    card({ id: "late", startedAt: "2026-09-14T15:00:00.000Z" }),
    card({ id: "early", startedAt: "2026-09-14T12:00:00.000Z", estimatedFinishAt: undefined }),
  ]);

  expect(grouped["2026-09-14"]?.map((event) => event.id)).toEqual(["early", "late"]);
  expect(grouped["2026-09-14"]?.[0]).toMatchObject({ minutes: 0, time: "09:00" });
});

test("long-running events and steps stay out of the agenda even when the response carries them", () => {
  const grouped = agendaEventsByDay([
    card({ id: "long", longRunning: true, status: "doing" }),
    card({ id: "step", kind: "step" }),
    card({ id: "no-time", startedAt: undefined }),
  ]);

  expect(grouped).toEqual({});
});

test("deduplicates cards returned by adjacent pages", () => {
  const event = card({ id: "same" });
  expect(agendaEventsByDay([event, event])["2026-09-14"]).toHaveLength(1);
});

test("lists an event that crosses midnight on both its start and planned end days", () => {
  const grouped = agendaEventsByDay([
    card({
      id: "night-shift",
      startedAt: "2026-09-14T22:00:00.000Z",
      estimatedFinishAt: "2026-09-15T08:00:00.000Z",
    }),
  ]);

  expect(grouped["2026-09-14"]?.map((event) => event.id)).toEqual(["night-shift"]);
  expect(grouped["2026-09-15"]?.map((event) => event.id)).toEqual(["night-shift"]);
});
