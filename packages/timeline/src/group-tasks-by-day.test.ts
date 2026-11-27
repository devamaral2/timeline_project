import { expect, test } from "vitest";
import type { AgendaTaskCard } from "./agenda-day";
import { groupTasksByDay } from "./group-tasks-by-day";

function anTask(overrides: Partial<AgendaTaskCard> = {}): AgendaTaskCard {
  return {
    id: "task-1",
    actor: "human",
    kind: "common",
    priority: "medium",
    longRunning: false,
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    notifyOffsetsMinutes: [],
    name: "Bloco de trabalho",
    description: "",
    project: { id: "project-1", name: "diario", personal: true },
    startedAt: "2026-08-19T12:00:00.000Z",
    estimatedFinishAt: "2026-08-19T13:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

test("keeps a late night task on its Sao Paulo day, not the UTC one", () => {
  const days = groupTasksByDay(
    [anTask({ id: "late", startedAt: "2026-08-15T23:30:00-03:00", estimatedFinishAt: undefined })],
    "2026-08-19",
  );

  expect(days).toHaveLength(1);
  expect(days[0]?.dayKey).toBe("2026-08-15");
});

test("groups tasks by day in descending order and flags today", () => {
  const days = groupTasksByDay(
    [
      anTask({ id: "a", startedAt: "2026-08-17T12:00:00-03:00", estimatedFinishAt: undefined }),
      anTask({ id: "b", startedAt: "2026-08-19T09:00:00-03:00", estimatedFinishAt: undefined }),
      anTask({ id: "c", startedAt: "2026-08-19T18:00:00-03:00", estimatedFinishAt: undefined }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-19", "2026-08-17"]);
  expect(days[0]?.isToday).toBe(true);
  expect(days[1]?.isToday).toBe(false);
  expect(days[0]?.tasks.map((task) => task.id)).toEqual(["c", "b"]);
});

test("drops duplicated ids coming from overlapping windows", () => {
  const days = groupTasksByDay(
    [
      anTask({ id: "same", startedAt: "2026-08-19T09:00:00-03:00", estimatedFinishAt: undefined }),
      anTask({ id: "same", startedAt: "2026-08-19T09:00:00-03:00", estimatedFinishAt: undefined }),
    ],
    "2026-08-19",
  );

  expect(days[0]?.tasks).toHaveLength(1);
});

test("lists a task that crosses midnight on the day it started and the day it ended", () => {
  const days = groupTasksByDay(
    [
      anTask({
        id: "night",
        startedAt: "2026-08-18T22:00:00-03:00",
        estimatedFinishAt: "2026-08-19T02:00:00-03:00",
      }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-19", "2026-08-18"]);
  expect(days.flatMap((day) => day.tasks.map((task) => task.id))).toEqual(["night", "night"]);
});

test("does not carry a task ending exactly at midnight into the next day", () => {
  const days = groupTasksByDay(
    [
      anTask({
        id: "until-midnight",
        startedAt: "2026-08-18T22:00:00-03:00",
        estimatedFinishAt: "2026-08-19T00:00:00-03:00",
      }),
    ],
    "2026-08-19",
  );

  expect(days.map((day) => day.dayKey)).toEqual(["2026-08-18"]);
});
