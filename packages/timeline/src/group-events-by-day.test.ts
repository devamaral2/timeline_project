import { expect, test } from "vitest";
import type { TimelineEventCardDto } from "@repo/contracts";
import { groupEventsByDay } from "./group-events-by-day";

function anEvent(overrides: Partial<TimelineEventCardDto> = {}): TimelineEventCardDto {
  return {
    id: "event-1",
    kind: "routine",
    noteTypes: [],
    missed: false,
    notifyOffsetsMinutes: [],
    name: "Bloco de trabalho",
    description: "",
    startedAt: "2026-08-19T12:00:00.000Z",
    finishedAt: "2026-08-19T13:00:00.000Z",
    durationLabel: "1h 00m",
    tags: [],
    interruptions: [],
    ...overrides,
  };
}

test("keeps a late night event on its Sao Paulo day, not the UTC one", () => {
  const days = groupEventsByDay(
    [anEvent({ id: "late", startedAt: "2026-08-15T23:30:00-03:00", finishedAt: undefined })],
    "2026-08-19",
  );

  expect(days).toHaveLength(1);
  expect(days[0]?.dayKey).toBe("2026-08-15");
});

test("groups events by day in descending order and flags today", () => {
  const days = groupEventsByDay(
    [
      anEvent({ id: "a", startedAt: "2026-08-17T12:00:00-03:00", finishedAt: undefined }),
      anEvent({ id: "b", startedAt: "2026-08-19T09:00:00-03:00", finishedAt: undefined }),
      anEvent({ id: "c", startedAt: "2026-08-19T18:00:00-03:00", finishedAt: undefined }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-19", "2026-08-17"]);
  expect(days[0]?.isToday).toBe(true);
  expect(days[1]?.isToday).toBe(false);
  expect(days[0]?.events.map((event) => event.id)).toEqual(["c", "b"]);
});

test("drops duplicated ids coming from overlapping windows", () => {
  const days = groupEventsByDay(
    [
      anEvent({ id: "same", startedAt: "2026-08-19T09:00:00-03:00", finishedAt: undefined }),
      anEvent({ id: "same", startedAt: "2026-08-19T09:00:00-03:00", finishedAt: undefined }),
    ],
    "2026-08-19",
  );

  expect(days[0]?.events).toHaveLength(1);
});

test("lists an event that crosses midnight on the day it started and the day it ended", () => {
  const days = groupEventsByDay(
    [
      anEvent({
        id: "night",
        startedAt: "2026-08-18T22:00:00-03:00",
        finishedAt: "2026-08-19T02:00:00-03:00",
      }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-19", "2026-08-18"]);
  expect(days.flatMap((day) => day.events.map((event) => event.id))).toEqual(["night", "night"]);
});

test("does not carry an event ending exactly at midnight into the next day", () => {
  const days = groupEventsByDay(
    [
      anEvent({
        id: "until-midnight",
        startedAt: "2026-08-18T22:00:00-03:00",
        finishedAt: "2026-08-19T00:00:00-03:00",
      }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-18"]);
});
