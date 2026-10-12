import { describe, expect, test } from "vitest";
import type { RecurrenceRule } from "@repo/contracts";
import { describeRecurrenceRule } from "./describe-recurrence-rule";

const base = { interval: 1, timeOfDay: "07:00", timeZone: "America/Sao_Paulo", startsOn: "2026-10-13" } as const;
const rule = (overrides: Partial<RecurrenceRule>): RecurrenceRule => ({ frequency: "daily", ...base, ...overrides });

describe("describeRecurrenceRule", () => {
  test("daily", () => {
    expect(describeRecurrenceRule(rule({}))).toBe("todo dia às 07:00, a partir de 13/10/2026");
    expect(describeRecurrenceRule(rule({ interval: 3 }))).toBe("a cada 3 dias às 07:00, a partir de 13/10/2026");
  });

  test("weekly names the days, with the special cases", () => {
    const weekly = (byWeekday: number, extra: Partial<RecurrenceRule> = {}) =>
      describeRecurrenceRule(rule({ frequency: "weekly", byWeekday, ...extra }));

    expect(weekly(0b000_1010)).toBe("toda segunda e quarta às 07:00, a partir de 13/10/2026");
    expect(weekly(0b011_1110)).toBe("de segunda a sexta às 07:00, a partir de 13/10/2026");
    expect(weekly(0b111_1111)).toBe("todo dia às 07:00, a partir de 13/10/2026");
    expect(weekly(0b100_0001)).toBe("todo domingo e sábado às 07:00, a partir de 13/10/2026");
    expect(weekly(0b000_0100, { interval: 2 })).toBe("a cada 2 semanas, terça às 07:00, a partir de 13/10/2026");
  });

  test("monthly and yearly", () => {
    expect(describeRecurrenceRule(rule({ frequency: "monthly", byMonthDay: 15 }))).toBe(
      "todo dia 15 do mês às 07:00, a partir de 13/10/2026",
    );
    expect(describeRecurrenceRule(rule({ frequency: "yearly", byMonthDay: 15, byMonth: 3 }))).toBe(
      "todo ano em 15 de março às 07:00, a partir de 13/10/2026",
    );
  });

  test("duration and end date", () => {
    expect(describeRecurrenceRule(rule({ durationMinutes: 90, endsOn: "2026-12-31" }))).toBe(
      "todo dia às 07:00 por 1 h 30, a partir de 13/10/2026 até 31/12/2026",
    );
  });
});
