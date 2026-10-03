import { expect, test } from "vitest";
import type { Event } from "../../../domain";
import type { DayContextEvent } from "../day-context.query";
import { planDayRearrangement } from "./plan-day-rearrangement";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 16, 3) + hour * 3_600_000 + minute * 60_000);
const target = { id: "work", startedAt: at(13), finishedAt: at(17) } as Event;
const event = (id: string, name: string, start: number, end: number): DayContextEvent => ({
  id, name, started_at: at(start).toISOString(), finished_at: at(end).toISOString(),
  recurrence_id: null, taskIds: [], kind: "routine",
});

test("shifts only the overlapping chain and preserves each duration", () => {
  const plan = planDayRearrangement(target, [
    event("work", "Trabalho", 13, 16),
    event("leisure", "Lazer", 16, 17),
    event("reading", "Ler", 20, 21),
  ]);
  expect(plan).toEqual({ kind: "ready", shifts: [{
    id: "leisure", kind: "routine", startedAt: at(17), finishedAt: at(18),
  }] });
});

test("continues through a shorter gap when the shifted event reaches the next one", () => {
  const plan = planDayRearrangement(target, [event("a", "A", 16, 17), event("b", "B", 17.5, 18.5)]);
  expect(plan.kind).toBe("ready");
  if (plan.kind === "ready") expect(plan.shifts.map((shift) => [shift.id, shift.startedAt, shift.finishedAt])).toEqual([
    ["a", at(17), at(18)], ["b", at(18), at(19)],
  ]);
});

test("asks for an order when two affected events start together", () => {
  expect(planDayRearrangement(target, [event("a", "A", 16, 17), event("b", "B", 16, 17)]).kind)
    .toBe("clarification");
});
