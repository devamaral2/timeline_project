import { beforeEach, expect, test } from "vitest";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import {
  clearDayPages,
  dayPageOf,
  forgetDayPage,
  mergeDayPage,
  rememberDayPage,
} from "./timeline-page-cache";

function anEvent(id: string, startedAt: string): TimelineEventCardDto {
  return {
    id,
    primaryItemId: `${id}-item`,
    primaryItemType: "routine",
    itemTypes: ["routine"],
    missed: false,
    name: id,
    description: "",
    startedAt,
    finishedAt: undefined,
    durationLabel: "--",
    tags: [],
    interruptions: [],
  };
}

// O backend pagina do mais novo para o mais antigo: a primeira pagina traz as
// 9h, a segunda as 7h.
const nineAm = anEvent("nine", "2026-08-31T09:00:00.000Z");
const eightAm = anEvent("eight", "2026-08-31T08:00:00.000Z");
const sevenAm = anEvent("seven", "2026-08-31T07:00:00.000Z");

beforeEach(() => {
  clearDayPages();
});

test("the first page comes down in ascending order, and not in the order the API sent", () => {
  const first = mergeDayPage([], { items: [nineAm, eightAm], nextCursor: "page-2" });

  expect(first.items.map((event) => event.id)).toEqual(["eight", "nine"]);
  expect(first.nextCursor).toBe("page-2");
});

test("the next page is older, so it lands above what is already on screen", () => {
  const first = mergeDayPage([], { items: [nineAm, eightAm], nextCursor: "page-2" });
  const second = mergeDayPage(first.items, { items: [sevenAm] });

  expect(second.items.map((event) => event.id)).toEqual(["seven", "eight", "nine"]);
});

test("does not repeat an event that came in both pages", () => {
  const first = mergeDayPage([], { items: [nineAm, eightAm], nextCursor: "page-2" });
  const second = mergeDayPage(first.items, { items: [eightAm, sevenAm] });

  expect(second.items.map((event) => event.id)).toEqual(["seven", "eight", "nine"]);
});

test("two events started at the same instant keep a stable order", () => {
  const sameTime = anEvent("aaa", "2026-08-31T08:00:00.000Z");

  const page = mergeDayPage([], { items: [eightAm, sameTime] });

  expect(page.items.map((event) => event.id)).toEqual(["aaa", "eight"]);
});

test("the end of the list is the page without a cursor", () => {
  const last = mergeDayPage([sevenAm], { items: [eightAm] });

  expect(last.nextCursor).toBeUndefined();
});

test("gives back the day it remembered, cursor included", () => {
  const page = mergeDayPage([], { items: [nineAm], nextCursor: "page-2" });
  rememberDayPage("user-1", "2026-08-31", page);

  expect(dayPageOf("user-1", "2026-08-31")).toEqual(page);
});

test("two accounts on the same phone do not share a day", () => {
  rememberDayPage("user-1", "2026-08-31", mergeDayPage([], { items: [nineAm] }));

  expect(dayPageOf("user-2", "2026-08-31")).toBeUndefined();
});

test("forgetting one day leaves the others alone", () => {
  rememberDayPage("user-1", "2026-08-31", mergeDayPage([], { items: [nineAm] }));
  rememberDayPage("user-1", "2026-08-30", mergeDayPage([], { items: [eightAm] }));

  forgetDayPage("user-1", "2026-08-31");

  expect(dayPageOf("user-1", "2026-08-31")).toBeUndefined();
  expect(dayPageOf("user-1", "2026-08-30")).toBeDefined();
});

test("a day never loaded is undefined, and not an empty page", () => {
  // A distincao e o que separa "ainda nao pedi" de "pedi e nao tem nada".
  expect(dayPageOf("user-1", "2026-08-31")).toBeUndefined();
});
