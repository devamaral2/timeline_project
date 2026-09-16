import { expect, test } from "vitest";
import type { RecurrenceRule } from "../contracts/recurrence-rule";
import { RecurrenceValidationError } from "../errors/recurrence.errors";
import { Task } from "../../tasks/entities/task.entity";
import { Recurrence } from "./recurrence.entity";

const daily: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "07:00",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
};

function create(rule: Partial<RecurrenceRule>) {
  return Recurrence.create({
    userId: "user-1",
    target: "event",
    rule: { ...daily, ...rule },
    template: { name: "Correr" },
  });
}

test("creates a recurrence at revision 1 with nothing materialized yet", () => {
  const recurrence = create({});
  expect(recurrence.revision).toBe(1);
  expect(recurrence.materializedThrough).toBeUndefined();
});

test.each([
  ["weekly without weekdays", { frequency: "weekly" as const }],
  ["daily with weekdays", { byWeekday: 2 }],
  ["monthly without a day", { frequency: "monthly" as const }],
  ["yearly without a month", { frequency: "yearly" as const, byMonthDay: 1 }],
  ["a day that never happens", { frequency: "yearly" as const, byMonth: 2, byMonthDay: 30 }],
  ["an empty weekday mask", { frequency: "weekly" as const, byWeekday: 0 }],
  ["interval zero", { interval: 0 }],
  ["a malformed time", { timeOfDay: "7h" }],
  ["an unknown time zone", { timeZone: "Mars/Olympus" }],
  ["an impossible date", { startsOn: "2026-02-30" }],
  ["an end before the start", { endsOn: "2026-08-31" }],
  ["a zero duration", { durationMinutes: 0 }],
])("rejects %s", (_, rule) => {
  expect(() => create(rule)).toThrow(RecurrenceValidationError);
});

test("accepts February 29 on a yearly rule", () => {
  expect(() => create({ frequency: "yearly", byMonth: 2, byMonthDay: 29 })).not.toThrow();
});

test("drops keys that are not part of the rule", () => {
  const recurrence = create({ garbage: true } as Partial<RecurrenceRule>);
  expect(recurrence.rule).not.toHaveProperty("garbage");
});

test("revising bumps the revision and resets the watermark", () => {
  const materialized = create({}).materializedUntil("2026-10-01");
  const revised = materialized.revise({ rule: { timeOfDay: "08:00" } });

  expect(materialized.revision).toBe(1);
  expect(revised.revision).toBe(2);
  expect(revised.rule.timeOfDay).toBe("08:00");
  expect(revised.materializedThrough).toBeUndefined();
});

test("editing an occurrence detaches it from its series", () => {
  const occurrence = Task.create({
    userId: "user-1",
    name: "Pagar aluguel",
    description: "",
    tags: [],
    occurrence: { recurrenceId: "01K2SERIES0000000000000000", occurrenceOn: "2026-10-05", detached: false },
  });

  const edited = occurrence.revise({ status: "done" });

  expect(occurrence.occurrence?.detached).toBe(false);
  expect(edited.occurrence).toEqual({
    recurrenceId: "01K2SERIES0000000000000000",
    occurrenceOn: "2026-10-05",
    detached: true,
  });
});
