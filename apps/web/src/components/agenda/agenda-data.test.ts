import type { TaskCardDto } from "@repo/contracts";
import { expect, test } from "vitest";
import { type AgendaCard, agendaTaskFromCard, agendaTasksByDay } from "./agenda-data";

function card(overrides: Partial<TaskCardDto> = {}): TaskCardDto {
  return {
    id: "task-1",
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: "Planejar o dia",
    description: "",
    project: { id: "project-1", name: "diario", personal: true },
    startedAt: "2026-09-14T12:00:00.000Z",
    estimatedFinishAt: "2026-09-14T12:30:00.000Z",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: ["pessoal"],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

test("maps a card to the grid model, keeping the card for the row", () => {
  const source = card();
  expect(agendaTaskFromCard(source as AgendaCard)).toMatchObject({
    id: "task-1",
    time: "09:00 — 09:30",
    minutes: 30,
    tags: ["pessoal"],
    card: source,
  });
});

test.each(["step", "save_content", "save_content_with_transcription"] as const)(
  "a %s task never enters the grid, even when the response carries it",
  (kind) => {
    const grouped = agendaTasksByDay([card({ id: "kept" }), card({ id: "left-out", actor: "agent", kind, status: "done" })]);
    expect(Object.values(grouped).flat().map((task) => task.id)).toEqual(["kept"]);
  },
);

test("the grid closes at the planned end, so a real conclusion does not move the task", () => {
  const grouped = agendaTasksByDay([
    card({ finishedAt: "2026-09-14T13:00:00.000Z", status: "done" }),
  ]);

  expect(grouped["2026-09-14"]?.[0]).toMatchObject({ minutes: 30, time: "09:00 — 09:30" });
});

test("shows only the start time for cards without a planned end, and sorts each day by the clock", () => {
  const grouped = agendaTasksByDay([
    card({ id: "late", startedAt: "2026-09-14T15:00:00.000Z" }),
    card({ id: "early", startedAt: "2026-09-14T12:00:00.000Z", estimatedFinishAt: undefined }),
  ]);

  expect(grouped["2026-09-14"]?.map((task) => task.id)).toEqual(["early", "late"]);
  expect(grouped["2026-09-14"]?.[0]).toMatchObject({ minutes: 0, time: "09:00" });
});

test("long-running tasks and steps stay out of the agenda even when the response carries them", () => {
  const grouped = agendaTasksByDay([
    card({ id: "long", longRunning: true, status: "doing" }),
    card({ id: "step", kind: "step" }),
    card({ id: "no-time", startedAt: undefined }),
  ]);

  expect(grouped).toEqual({});
});

test("deduplicates cards returned by adjacent pages", () => {
  const task = card({ id: "same" });
  expect(agendaTasksByDay([task, task])["2026-09-14"]).toHaveLength(1);
});

test("lists an task that crosses midnight on both its start and planned end days", () => {
  const grouped = agendaTasksByDay([
    card({
      id: "night-shift",
      startedAt: "2026-09-14T22:00:00.000Z",
      estimatedFinishAt: "2026-09-15T08:00:00.000Z",
    }),
  ]);

  expect(grouped["2026-09-14"]?.map((task) => task.id)).toEqual(["night-shift"]);
  expect(grouped["2026-09-15"]?.map((task) => task.id)).toEqual(["night-shift"]);
});
