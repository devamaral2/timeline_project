import { expect, test } from "vitest";
import { eventDayKeysOf } from "./event-days";

test("returns only the start day for events without an end or within one day", () => {
  expect(eventDayKeysOf("2026-08-18T10:00:00-03:00")).toEqual(["2026-08-18"]);
  expect(eventDayKeysOf("2026-08-18T10:00:00-03:00", null)).toEqual(["2026-08-18"]);
  expect(eventDayKeysOf("2026-08-18T10:00:00-03:00", "2026-08-18T23:59:00-03:00")).toEqual(["2026-08-18"]);
});

test("returns the start and end days when the event crosses midnight", () => {
  expect(eventDayKeysOf("2026-08-18T22:00:00-03:00", "2026-08-19T06:30:00-03:00")).toEqual([
    "2026-08-18",
    "2026-08-19",
  ]);
});

test("uses the Sao Paulo day, not the UTC one", () => {
  // 23:30 e 00:30 em Sao Paulo ja sao dias diferentes, mas o UTC cai todo em 19.
  expect(eventDayKeysOf("2026-08-19T02:30:00Z", "2026-08-19T03:30:00Z")).toEqual(["2026-08-18", "2026-08-19"]);
});

test("includes every day in between for events longer than two days", () => {
  expect(eventDayKeysOf("2026-08-18T22:00:00-03:00", "2026-08-20T08:00:00-03:00")).toEqual([
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
  ]);
});

test("ignores an end that is not after the start", () => {
  expect(eventDayKeysOf("2026-08-18T22:00:00-03:00", "2026-08-18T21:00:00-03:00")).toEqual(["2026-08-18"]);
});
