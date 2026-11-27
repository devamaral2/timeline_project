import { expect, test } from "vitest";
import type { AgendaTaskCard } from "./agenda-day";
import {
  MIN_DURATION_RATIO,
  durationRatioOf,
  taskPositionOf,
  longestDurationOf,
  elapsedSecondsOf,
  formatStopwatch,
  stopwatchOf,
  trackedMinutesOf,
} from "./task-metrics";

function task(startedAt: string, estimatedFinishAt: string | null): AgendaTaskCard {
  return {
    id: `${startedAt}-${estimatedFinishAt}`,
    actor: "human",
    kind: "common",
    priority: "medium",
    longRunning: false,
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    notifyOffsetsMinutes: [],
    name: "tarefa",
    description: "",
    project: { id: "project-1", name: "diario", personal: true },
    startedAt,
    estimatedFinishAt: estimatedFinishAt ?? undefined,
    tags: [],
  };
}

const short = task("2026-05-22T12:00:00.000Z", "2026-05-22T12:15:00.000Z");
const long = task("2026-05-22T14:00:00.000Z", "2026-05-22T17:00:00.000Z");
const running = task("2026-05-22T18:00:00.000Z", null);
const upcoming = task("2026-05-23T09:00:00.000Z", "2026-05-23T10:00:00.000Z");
const openFuture = task("2026-05-23T09:00:00.000Z", null);

test("takes the longest finished task as the reference of the day", () => {
  expect(longestDurationOf([short, long, running])).toBe(180);
  expect(longestDurationOf([running])).toBe(0);
});

test("scales the bar against that reference", () => {
  expect(durationRatioOf(long, 180)).toBe(1);
  expect(durationRatioOf(short, 180)).toBeCloseTo(15 / 180);
});

test("keeps a very short task visible instead of drawing nothing", () => {
  const oneMinute = task("2026-05-22T12:00:00.000Z", "2026-05-22T12:01:00.000Z");
  expect(durationRatioOf(oneMinute, 600)).toBe(MIN_DURATION_RATIO);
});

test("has no bar for a task still running — it has no duration yet", () => {
  expect(durationRatioOf(running, 180)).toBeNull();
});

test("sums only what has already finished", () => {
  expect(trackedMinutesOf([short, long, running])).toBe(195);
});

test("counts the seconds since the task started, and never goes backwards", () => {
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

test("only a running task has a stopwatch", () => {
  const now = new Date("2026-05-22T18:30:00.000Z");
  expect(stopwatchOf(running, now)).toBe("30:00");
  expect(stopwatchOf(long, now)).toBeNull();
});

test("places a task against now in three states, not two", () => {
  const now = new Date("2026-05-22T18:30:00.000Z");

  expect(taskPositionOf(long, now)).toBe("past");
  expect(taskPositionOf(running, now)).toBe("running");
  expect(taskPositionOf(upcoming, now)).toBe("upcoming");
  // Sem fim declarado, mas ainda nem comecou: e futuro, nao cronometro.
  expect(taskPositionOf(openFuture, now)).toBe("upcoming");
});

test("a task already started with an end still ahead is running", () => {
  const now = new Date("2026-05-22T15:00:00.000Z");

  expect(taskPositionOf(long, now)).toBe("running");
});

test("a task that has not started has no stopwatch", () => {
  const now = new Date("2026-05-22T18:30:00.000Z");

  expect(stopwatchOf(openFuture, now)).toBeNull();
});
