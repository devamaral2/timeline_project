import { describe, expect, test } from "vitest";
import type { RecurrenceRule } from "../contracts/recurrence-rule";
import { RecurrenceValidationError } from "../errors/recurrence.errors";
import { Recurrence } from "./recurrence.entity";

const daily: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "07:00",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
};
const weekly: RecurrenceRule = { ...daily, frequency: "weekly", byWeekday: 0b0101010 };
const monthly: RecurrenceRule = { ...daily, frequency: "monthly", byMonthDay: 5 };
const yearly: RecurrenceRule = { ...daily, frequency: "yearly", byMonthDay: 15, byMonth: 3 };

const template = { name: "Correr", kind: "common", artifactIds: ["artifact-1"], previousTaskIds: [] };

function create(rule: Partial<RecurrenceRule> = {}, base: RecurrenceRule = daily): Recurrence {
  return Recurrence.create({ userId: "user-1", rule: { ...base, ...rule }, template });
}

describe("Recurrence.create", () => {
  test("creates a series with revision 1 and nothing generated yet", () => {
    const recurrence = create();

    expect(recurrence.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(recurrence.userId).toBe("user-1");
    expect(recurrence.revision).toBe(1);
    expect(recurrence.materializedThrough).toBeUndefined();
    expect(recurrence.rule).toEqual(daily);
    expect(recurrence.template).toEqual(template);
  });

  test("keeps the id it was given", () => {
    expect(Recurrence.create({ id: "rec-1", userId: "user-1", rule: daily, template }).id).toBe("rec-1");
  });

  test("accepts every frequency with the fields it needs", () => {
    expect(create({}, weekly).rule).toEqual(weekly);
    expect(create({}, monthly).rule).toEqual(monthly);
    expect(create({}, yearly).rule).toEqual(yearly);
    expect(create({ durationMinutes: 30, endsOn: "2026-12-31" }).rule).toEqual({
      ...daily,
      durationMinutes: 30,
      endsOn: "2026-12-31",
    });
  });

  test("keeps only the keys of the rule: there is no target anymore", () => {
    const recurrence = create({ target: "task", template: { name: "x" } } as never);

    expect(recurrence.rule).toEqual(daily);
    expect(recurrence.rule).not.toHaveProperty("target");
    expect(recurrence).not.toHaveProperty("target");
  });

  test("freezes the rule and keeps its own frozen copy of the template", () => {
    const source = { name: "Correr", tags: ["saude"], artifactIds: ["artifact-1"] };
    const recurrence = Recurrence.create({ userId: "user-1", rule: daily, template: source });

    source.tags.push("manha");
    source.artifactIds.push("artifact-2");

    expect(recurrence.template).toEqual({ name: "Correr", tags: ["saude"], artifactIds: ["artifact-1"] });
    expect(Object.isFrozen(recurrence.rule)).toBe(true);
    expect(Object.isFrozen(recurrence.template)).toBe(true);
  });

  test("the template only has to be an object", () => {
    expect(Recurrence.create({ userId: "user-1", rule: daily, template: {} }).template).toEqual({});
    expect(() => Recurrence.create({ userId: "user-1", rule: daily, template: [] as never })).toThrow(
      "Recurrence template must be an object",
    );
    expect(() => Recurrence.create({ userId: "user-1", rule: daily, template: null as never })).toThrow(
      RecurrenceValidationError,
    );
    expect(() => Recurrence.create({ userId: "user-1", rule: daily, template: "Correr" as never })).toThrow(
      RecurrenceValidationError,
    );
  });

  describe("rule validation", () => {
    test("rejects an unknown frequency", () => {
      expect(() => create({ frequency: "hourly" as never })).toThrow("Invalid recurrence frequency");
    });

    test("requires an integer interval >= 1", () => {
      expect(() => create({ interval: 0 })).toThrow("Recurrence interval must be an integer >= 1");
      expect(() => create({ interval: 1.5 })).toThrow(RecurrenceValidationError);
      expect(() => create({ interval: 32768 })).toThrow(RecurrenceValidationError);
      expect(create({ interval: 3 }).rule.interval).toBe(3);
    });

    test("byWeekday is required for weekly series, and only for them", () => {
      expect(() => create({ byWeekday: undefined }, weekly)).toThrow(
        "byWeekday is required for weekly recurrences, and only for them",
      );
      expect(() => create({ byWeekday: 0b0000001 })).toThrow(RecurrenceValidationError);
      expect(() => create({ byWeekday: 0b0000001 }, monthly)).toThrow(RecurrenceValidationError);
    });

    test("byWeekday must pick at least one of the seven days", () => {
      expect(() => create({ byWeekday: 0 }, weekly)).toThrow("byWeekday must pick at least one weekday");
      expect(() => create({ byWeekday: 128 }, weekly)).toThrow("byWeekday must pick at least one weekday");
      expect(create({ byWeekday: 127 }, weekly).rule.byWeekday).toBe(127);
    });

    test("byMonthDay is required for monthly and yearly series, and only for them", () => {
      expect(() => create({ byMonthDay: undefined }, monthly)).toThrow(
        "byMonthDay is required for monthly and yearly recurrences, and only for them",
      );
      expect(() => create({ byMonthDay: undefined }, yearly)).toThrow(RecurrenceValidationError);
      expect(() => create({ byMonthDay: 5 })).toThrow(RecurrenceValidationError);
      expect(() => create({ byMonthDay: 5 }, weekly)).toThrow(RecurrenceValidationError);
    });

    test("byMonthDay stays between 1 and 31", () => {
      expect(() => create({ byMonthDay: 0 }, monthly)).toThrow("byMonthDay must be between 1 and 31");
      expect(() => create({ byMonthDay: 32 }, monthly)).toThrow("byMonthDay must be between 1 and 31");
      expect(create({ byMonthDay: 31 }, monthly).rule.byMonthDay).toBe(31);
    });

    test("byMonth is required for yearly series, and only for them", () => {
      expect(() => create({ byMonth: undefined }, yearly)).toThrow(
        "byMonth is required for yearly recurrences, and only for them",
      );
      expect(() => create({ byMonth: 3 }, monthly)).toThrow(RecurrenceValidationError);
      expect(() => create({ byMonth: 13 }, yearly)).toThrow("byMonth must be between 1 and 12");
    });

    test("refuses a yearly day that never happens, but accepts February 29", () => {
      expect(() => create({ byMonth: 2, byMonthDay: 30 }, yearly)).toThrow("That day never happens in that month");
      expect(() => create({ byMonth: 4, byMonthDay: 31 }, yearly)).toThrow("That day never happens in that month");
      expect(create({ byMonth: 2, byMonthDay: 29 }, yearly).rule.byMonthDay).toBe(29);
    });

    test("timeOfDay must be HH:MM in 24 hours", () => {
      expect(() => create({ timeOfDay: "7:00" })).toThrow("timeOfDay must be HH:MM");
      expect(() => create({ timeOfDay: "24:00" })).toThrow("timeOfDay must be HH:MM");
      expect(() => create({ timeOfDay: "07:60" })).toThrow("timeOfDay must be HH:MM");
      expect(create({ timeOfDay: "23:59" }).rule.timeOfDay).toBe("23:59");
    });

    test("durationMinutes must be a positive integer when given", () => {
      expect(() => create({ durationMinutes: 0 })).toThrow("durationMinutes must be a positive integer");
      expect(() => create({ durationMinutes: 12.5 })).toThrow("durationMinutes must be a positive integer");
      expect(create({ durationMinutes: 45 }).rule.durationMinutes).toBe(45);
    });

    test("rejects an unknown time zone", () => {
      expect(() => create({ timeZone: "Marte/Olympus" })).toThrow("Invalid time zone");
      expect(() => create({ timeZone: "" })).toThrow("Invalid time zone");
    });

    test("startsOn must be a real calendar day", () => {
      expect(() => create({ startsOn: "01/09/2026" })).toThrow("startsOn must be YYYY-MM-DD");
      expect(() => create({ startsOn: "2026-02-30" })).toThrow("startsOn must be YYYY-MM-DD");
    });

    test("endsOn must be a real calendar day on or after startsOn", () => {
      expect(() => create({ endsOn: "2026-13-01" })).toThrow("endsOn must be YYYY-MM-DD");
      expect(() => create({ endsOn: "2026-08-31" })).toThrow("endsOn must be on or after startsOn");
      expect(create({ endsOn: "2026-09-01" }).rule.endsOn).toBe("2026-09-01");
    });
  });
});

describe("Recurrence.rehydrate", () => {
  test("returns the series as stored, with its revision and watermark", () => {
    const recurrence = Recurrence.rehydrate({
      id: "rec-1",
      userId: "user-1",
      rule: weekly,
      template,
      revision: 4,
      materializedThrough: "2026-10-30",
    });

    expect(recurrence).toMatchObject({ id: "rec-1", revision: 4, materializedThrough: "2026-10-30" });
    expect(recurrence.rule).toEqual(weekly);
  });

  test("rejects a revision that is not an integer >= 1 and a watermark that is not a day", () => {
    const row = { id: "rec-1", userId: "user-1", rule: daily, template };

    expect(() => Recurrence.rehydrate({ ...row, revision: 0 })).toThrow("Recurrence revision must be an integer >= 1");
    expect(() => Recurrence.rehydrate({ ...row, revision: 1, materializedThrough: "2026-02-31" })).toThrow(
      "Invalid materializedThrough",
    );
  });
});

describe("Recurrence.revise", () => {
  const generated = Recurrence.rehydrate({
    id: "rec-1",
    userId: "user-1",
    rule: { ...daily, durationMinutes: 30, endsOn: "2026-12-31" },
    template,
    revision: 2,
    materializedThrough: "2026-10-30",
  });

  test("merges the rule changes, bumps the revision and resets the watermark", () => {
    const revised = generated.revise({ rule: { timeOfDay: "08:00" } });

    expect(revised.id).toBe("rec-1");
    expect(revised.revision).toBe(3);
    expect(revised.materializedThrough).toBeUndefined();
    expect(revised.rule).toEqual({ ...daily, timeOfDay: "08:00", durationMinutes: 30, endsOn: "2026-12-31" });
    expect(revised.template).toEqual(template);
    expect(generated.rule.timeOfDay).toBe("07:00");
    expect(generated.revision).toBe(2);
  });

  test("a rule key set to undefined removes the optional field", () => {
    const revised = generated.revise({ rule: { durationMinutes: undefined, endsOn: undefined } });

    expect(revised.rule).toEqual(daily);
  });

  test("replaces the whole template when one is given", () => {
    const revised = generated.revise({ template: { name: "Nadar", artifactIds: [] } });

    expect(revised.template).toEqual({ name: "Nadar", artifactIds: [] });
    expect(revised.rule).toEqual(generated.rule);
    expect(revised.revision).toBe(3);
  });

  test("validates the rule that results from the change", () => {
    expect(() => generated.revise({ rule: { frequency: "weekly" } })).toThrow(
      "byWeekday is required for weekly recurrences, and only for them",
    );
    expect(() => generated.revise({ rule: { endsOn: "2026-08-01" } })).toThrow("endsOn must be on or after startsOn");
    expect(generated.revise({ rule: { frequency: "weekly", byWeekday: 0b0000010 } }).rule.frequency).toBe("weekly");
  });

  test("changing frequency requires dropping the fields of the old one", () => {
    const series = Recurrence.create({ userId: "user-1", rule: weekly, template });

    expect(() => series.revise({ rule: { frequency: "daily" } })).toThrow(RecurrenceValidationError);
    expect(series.revise({ rule: { frequency: "daily", byWeekday: undefined } }).rule).toEqual(daily);
  });
});

describe("Recurrence.materializedUntil", () => {
  test("moves the watermark without counting as a revision", () => {
    const recurrence = create();

    const advanced = recurrence.materializedUntil("2026-11-01");

    expect(advanced.materializedThrough).toBe("2026-11-01");
    expect(advanced.revision).toBe(1);
    expect(advanced.id).toBe(recurrence.id);
    expect(advanced.rule).toEqual(recurrence.rule);
    expect(advanced.template).toEqual(recurrence.template);
    expect(recurrence.materializedThrough).toBeUndefined();
  });

  test("rejects a watermark that is not a calendar day", () => {
    expect(() => create().materializedUntil("2026-11-31")).toThrow("Invalid materializedThrough");
  });
});
