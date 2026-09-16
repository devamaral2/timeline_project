import { expect, test } from "vitest";
import type { RecurrenceRule } from "@repo/entities/contracts";
import { expandOccurrences, occurrenceWindow } from "./recurrence";

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    frequency: "daily",
    interval: 1,
    timeOfDay: "07:00",
    timeZone: "America/Sao_Paulo",
    startsOn: "2026-09-01",
    ...overrides,
  };
}

test("repeats every day from the first day", () => {
  expect(expandOccurrences(rule({}), "2026-08-30", "2026-09-03")).toEqual([
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
});

test("skips days according to the interval, counting from startsOn", () => {
  expect(expandOccurrences(rule({ interval: 3 }), "2026-09-02", "2026-09-10")).toEqual([
    "2026-09-04",
    "2026-09-07",
    "2026-09-10",
  ]);
});

test("stops at endsOn, inclusive", () => {
  expect(expandOccurrences(rule({ endsOn: "2026-09-02" }), "2026-09-01", "2026-09-30")).toEqual([
    "2026-09-01",
    "2026-09-02",
  ]);
});

test("leaves out the days that were skipped", () => {
  const exceptions = new Set(["2026-09-02"]);
  expect(expandOccurrences(rule({}), "2026-09-01", "2026-09-03", exceptions)).toEqual([
    "2026-09-01",
    "2026-09-03",
  ]);
});

test("repeats on the chosen weekdays", () => {
  // 2026-09-01 e uma terca. Segunda (bit 1) e quarta (bit 3).
  const weekly = rule({ frequency: "weekly", byWeekday: (1 << 1) | (1 << 3) });
  expect(expandOccurrences(weekly, "2026-09-01", "2026-09-09")).toEqual([
    "2026-09-02",
    "2026-09-07",
    "2026-09-09",
  ]);
});

test("repeats every other week, aligned on the week of startsOn", () => {
  const biweekly = rule({ frequency: "weekly", interval: 2, byWeekday: 1 << 1 });
  expect(expandOccurrences(biweekly, "2026-09-01", "2026-09-30")).toEqual([
    "2026-09-14",
    "2026-09-28",
  ]);
});

test("skips months that do not have the chosen day instead of clamping", () => {
  const monthly = rule({ frequency: "monthly", byMonthDay: 31, startsOn: "2026-01-01" });
  expect(expandOccurrences(monthly, "2026-01-01", "2026-05-31")).toEqual([
    "2026-01-31",
    "2026-03-31",
    "2026-05-31",
  ]);
});

test("skips February 29 on years that do not have it", () => {
  const yearly = rule({ frequency: "yearly", byMonth: 2, byMonthDay: 29, startsOn: "2027-01-01" });
  expect(expandOccurrences(yearly, "2027-01-01", "2029-12-31")).toEqual(["2028-02-29"]);
});

test("places the occurrence at the local wall clock time, with its duration", () => {
  const window = occurrenceWindow(rule({ durationMinutes: 45 }), "2026-09-01");
  expect(window.startedAt.toISOString()).toBe("2026-09-01T10:00:00.000Z");
  expect(window.finishedAt?.toISOString()).toBe("2026-09-01T10:45:00.000Z");
});

test("keeps the wall clock time across a daylight saving change", () => {
  const newYork = rule({ timeZone: "America/New_York" });
  // Em 2026 o horario de verao de Nova York termina em 1 de novembro.
  expect(occurrenceWindow(newYork, "2026-10-31").startedAt.toISOString()).toBe("2026-10-31T11:00:00.000Z");
  expect(occurrenceWindow(newYork, "2026-11-02").startedAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
});

test("an occurrence without duration has no end", () => {
  expect(occurrenceWindow(rule({}), "2026-09-01").finishedAt).toBeUndefined();
});
