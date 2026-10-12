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

const gym = { id: "gym", startedAt: at(7), finishedAt: at(7.5) } as Event;
const gymBefore = { startedAt: at(7), finishedAt: at(7 + 50 / 60) };

test("finishing earlier leaves the next event where it was", () => {
  const plan = planDayRearrangement(gym, [event("gym", "Academia", 7, 7.5), event("shower", "Banho", 7 + 50 / 60, 8 + 10 / 60)], gymBefore);
  expect(plan).toEqual({ kind: "ready", shifts: [] });
});

test("finishing later pushes the event that was planned right after", () => {
  const late = { id: "gym", startedAt: at(7), finishedAt: at(8 + 10 / 60) } as Event;
  const plan = planDayRearrangement(late, [
    event("gym", "Academia", 7, 7 + 50 / 60),
    event("shower", "Banho", 7 + 50 / 60, 8 + 10 / 60),
  ], gymBefore);
  expect(plan).toEqual({ kind: "ready", shifts: [{
    id: "shower", kind: "routine", startedAt: at(8 + 10 / 60), finishedAt: at(8 + 30 / 60),
  }] });
});

test("an event that already started inside the old interval is not pushed", () => {
  const late = { id: "gym", startedAt: at(7), finishedAt: at(8 + 10 / 60) } as Event;
  const plan = planDayRearrangement(late, [
    event("gym", "Academia", 7, 7 + 50 / 60),
    event("podcast", "Podcast", 7.25, 7.5),
    event("shower", "Banho", 7 + 50 / 60, 8 + 10 / 60),
  ], gymBefore);
  expect(plan.kind === "ready" && plan.shifts.map((shift) => shift.id)).toEqual(["shower"]);
});

test("an overlap before the start that this change did not cause is not a question", () => {
  const late = { id: "gym", startedAt: at(7), finishedAt: at(8) } as Event;
  const plan = planDayRearrangement(late, [event("wake", "Acordar", 6.5, 7.25), event("gym", "Academia", 7, 7.5)], { startedAt: at(7), finishedAt: at(7.5) });
  expect(plan).toEqual({ kind: "ready", shifts: [] });
});

test("moving the start still asks about the event that now occupies it", () => {
  const moved = { id: "gym", startedAt: at(7), finishedAt: at(8) } as Event;
  const plan = planDayRearrangement(moved, [event("wake", "Acordar", 6.5, 7.25)], { startedAt: at(7.5), finishedAt: at(8) });
  expect(plan.kind).toBe("clarification");
});
