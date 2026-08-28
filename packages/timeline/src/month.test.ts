import { expect, test } from "vitest";
import {
  daysInMonthOf,
  firstDayOfMonth,
  isSameMonth,
  monthGridOf,
  monthLabel,
  shiftMonthKey,
} from "./month";

test("titles the month of a day", () => {
  expect(monthLabel("2026-05-22")).toBe("Maio de 2026");
});

test("counts the days of a month, february included", () => {
  expect(daysInMonthOf("2026-02-10")).toBe(28);
  expect(daysInMonthOf("2024-02-10")).toBe(29);
  expect(daysInMonthOf("2026-05-01")).toBe(31);
});

test("clamps to the last day when the target month is shorter", () => {
  expect(shiftMonthKey("2026-03-31", -1)).toBe("2026-02-28");
  expect(shiftMonthKey("2026-01-31", 1)).toBe("2026-02-28");
});

test("crosses the year in both directions", () => {
  expect(shiftMonthKey("2026-01-15", -1)).toBe("2025-12-15");
  expect(shiftMonthKey("2026-12-15", 1)).toBe("2027-01-15");
});

test("opens the grid on a sunday and always fills six weeks", () => {
  const grid = monthGridOf("2026-05-22");
  expect(grid).toHaveLength(42);
  expect(grid[0]).toBe("2026-04-26");
  expect(grid).toContain("2026-05-01");
  expect(grid).toContain("2026-05-31");
});

test("keeps the grid at six weeks for a short month too", () => {
  expect(monthGridOf("2026-02-10")).toHaveLength(42);
});

test("groups by month and year, not by month alone", () => {
  expect(isSameMonth("2026-05-01", "2026-05-31")).toBe(true);
  expect(isSameMonth("2026-05-01", "2025-05-01")).toBe(false);
  expect(firstDayOfMonth("2026-05-22")).toBe("2026-05-01");
});
