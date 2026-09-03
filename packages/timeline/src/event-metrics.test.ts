import { expect, test } from "vitest";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import {
  MIN_DURATION_RATIO,
  durationRatioOf,
  longestDurationOf,
  elapsedSecondsOf,
  formatStopwatch,
  stopwatchOf,
  trackedMinutesOf,
} from "./event-metrics";

function event(startedAt: string, finishedAt: string | null): TimelineEventCardDto {
  return {
    id: `${startedAt}-${finishedAt}`,
    primaryItemId: `${startedAt}-item`,
    primaryItemType: "routine",
    itemTypes: ["routine"],
    missed: false,
    name: "evento",
    description: "",
    startedAt,
    finishedAt: finishedAt ?? undefined,
    durationLabel: "",
    tags: [],
    interruptions: [],
  };
}

const short = event("2026-05-22T12:00:00.000Z", "2026-05-22T12:15:00.000Z");
const long = event("2026-05-22T14:00:00.000Z", "2026-05-22T17:00:00.000Z");
const running = event("2026-05-22T18:00:00.000Z", null);

test("takes the longest finished event as the reference of the day", () => {
  expect(longestDurationOf([short, long, running])).toBe(180);
  expect(longestDurationOf([running])).toBe(0);
});

test("scales the bar against that reference", () => {
  expect(durationRatioOf(long, 180)).toBe(1);
  expect(durationRatioOf(short, 180)).toBeCloseTo(15 / 180);
});

test("keeps a very short event visible instead of drawing nothing", () => {
  const oneMinute = event("2026-05-22T12:00:00.000Z", "2026-05-22T12:01:00.000Z");
  expect(durationRatioOf(oneMinute, 600)).toBe(MIN_DURATION_RATIO);
});

test("has no bar for an event still running — it has no duration yet", () => {
  expect(durationRatioOf(running, 180)).toBeNull();
});

test("sums only what has already finished", () => {
  expect(trackedMinutesOf([short, long, running])).toBe(195);
});

test("counts the seconds since the event started, and never goes backwards", () => {
  const now = new Date("2026-05-22T18:30:45.000Z");
  expect(elapsedSecondsOf("2026-05-22T18:00:00.000Z", now)).toBe(1845);
  // Um relogio adiantado no aparelho nao pode produzir um cronometro negativo.
  expect(elapsedSecondsOf("2026-05-22T19:00:00.000Z", now)).toBe(0);
});

test("reads the stopwatch as a stopwatch, and not as the recorded duration", () => {
  expect(formatStopwatch(0)).toBe("0:00");
  expect(formatStopwatch(65)).toBe("1:05");
  expect(formatStopwatch(3599)).toBe("59:59");
  expect(formatStopwatch(3600)).toBe("1:00:00");
  expect(formatStopwatch(45296)).toBe("12:34:56");
});

test("only a running event has a stopwatch", () => {
  const now = new Date("2026-05-22T18:30:00.000Z");
  expect(stopwatchOf(running, now)).toBe("30:00");
  expect(stopwatchOf(long, now)).toBeNull();
});
