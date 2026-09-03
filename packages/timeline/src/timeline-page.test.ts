import { expect, test } from "vitest";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { mergeTimelinePage } from "./timeline-page";

function anEvent(id: string): TimelineEventCardDto {
  return {
    id,
    primaryItemId: `${id}-item`,
    primaryItemType: "routine",
    itemTypes: ["routine"],
    missed: false,
    name: id,
    description: "",
    startedAt: "2026-08-31T12:00:00.000Z",
    finishedAt: "2026-08-31T13:00:00.000Z",
    durationLabel: "1h 00m",
    tags: [],
    interruptions: [],
  };
}

const eventA = anEvent("a");
const eventB = anEvent("b");
const eventC = anEvent("c");

test("keeps the cursor of the page that just arrived", () => {
  const first = mergeTimelinePage([], { items: [eventA, eventB], nextCursor: "page-2" });

  expect(first.items.map((event) => event.id)).toEqual(["a", "b"]);
  expect(first.nextCursor).toBe("page-2");
});

test("does not repeat an event that came in both pages", () => {
  const first = mergeTimelinePage([], { items: [eventA, eventB], nextCursor: "page-2" });
  const second = mergeTimelinePage(first.items, { items: [eventB, eventC] });

  expect(second.items.map((event) => event.id)).toEqual(["a", "b", "c"]);
});

test("the end of the list is the page without a cursor", () => {
  const last = mergeTimelinePage([eventA], { items: [eventB] });

  expect(last.nextCursor).toBeUndefined();
});
