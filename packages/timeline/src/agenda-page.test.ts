import { expect, test } from "vitest";
import type { AgendaTaskCard } from "./agenda-day";
import { mergeAgendaPage } from "./agenda-page";

function anTask(id: string): AgendaTaskCard {
  return {
    id,
    actor: "human",
    kind: "common",
    priority: "medium",
    longRunning: false,
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    notifyOffsetsMinutes: [],
    name: id,
    description: "",
    project: { id: "project-1", name: "diario", personal: true },
    startedAt: "2026-08-31T12:00:00.000Z",
    estimatedFinishAt: "2026-08-31T13:00:00.000Z",
    tags: [],
  };
}

const taskA = anTask("a");
const taskB = anTask("b");
const taskC = anTask("c");

test("keeps the cursor of the page that just arrived", () => {
  const first = mergeAgendaPage([], { items: [taskA, taskB], nextCursor: "page-2" });

  expect(first.items.map((task) => task.id)).toEqual(["a", "b"]);
  expect(first.nextCursor).toBe("page-2");
});

test("does not repeat a task that came in both pages", () => {
  const first = mergeAgendaPage([], { items: [taskA, taskB], nextCursor: "page-2" });
  const second = mergeAgendaPage(first.items, { items: [taskB, taskC] });

  expect(second.items.map((task) => task.id)).toEqual(["a", "b", "c"]);
});

test("the end of the list is the page without a cursor", () => {
  const last = mergeAgendaPage([taskA], { items: [taskB] });

  expect(last.nextCursor).toBeUndefined();
});
