import { expect, test } from "vitest";
import type { AgendaEventCard } from "./agenda-day";
import { mergeAgendaPage } from "./agenda-page";

function anEvent(id: string): AgendaEventCard {
  return {
    id,
    actor: "human",
    kind: "common",
    priority: "medium",
    longRunning: false,
    artifactTypes: [],
    previousEventIds: [],
    revision: 1,
    notifyOffsetsMinutes: [],
    name: id,
    location: "",
    description: "",
    startedAt: "2026-08-31T12:00:00.000Z",
    estimatedFinishAt: "2026-08-31T13:00:00.000Z",
    tags: [],
  };
}

const eventA = anEvent("a");
const eventB = anEvent("b");
const eventC = anEvent("c");

test("keeps the cursor of the page that just arrived", () => {
  const first = mergeAgendaPage([], { items: [eventA, eventB], nextCursor: "page-2" });

  expect(first.items.map((event) => event.id)).toEqual(["a", "b"]);
  expect(first.nextCursor).toBe("page-2");
});

test("does not repeat an event that came in both pages", () => {
  const first = mergeAgendaPage([], { items: [eventA, eventB], nextCursor: "page-2" });
  const second = mergeAgendaPage(first.items, { items: [eventB, eventC] });

  expect(second.items.map((event) => event.id)).toEqual(["a", "b", "c"]);
});

test("the end of the list is the page without a cursor", () => {
  const last = mergeAgendaPage([eventA], { items: [eventB] });

  expect(last.nextCursor).toBeUndefined();
});
