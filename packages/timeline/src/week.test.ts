import { expect, test } from "vitest";
import { dayKeyRange, weekOf, weekdayIndexOf } from "./week";

test("reads the weekday of a civil date without dragging the time zone in twice", () => {
  // 2026-05-22 e uma sexta-feira; 2026-05-24, um domingo.
  expect(weekdayIndexOf("2026-05-22")).toBe(5);
  expect(weekdayIndexOf("2026-05-24")).toBe(0);
});

test("opens the week of a day from sunday to saturday", () => {
  expect(weekOf("2026-05-22")).toEqual([
    "2026-05-17",
    "2026-05-18",
    "2026-05-19",
    "2026-05-20",
    "2026-05-21",
    "2026-05-22",
    "2026-05-23",
  ]);
});

test("keeps a sunday as the first day of its own week", () => {
  expect(weekOf("2026-05-17")[0]).toBe("2026-05-17");
});

test("crosses the month and the year in a week", () => {
  expect(weekOf("2026-01-01")).toContain("2025-12-28");
});

test("counts a run of days from a starting key", () => {
  expect(dayKeyRange("2026-02-27", 3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  expect(dayKeyRange("2026-02-27", 0)).toEqual([]);
});
