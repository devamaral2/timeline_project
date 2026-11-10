import { expect, test } from "vitest";
import { type TimeSpan, freeTimeSlots } from "./free-time";

const at = (time: string) => new Date(`2026-09-14T${time}:00-03:00`).getTime();
const span = (start: string, end: string | null): TimeSpan => ({ startMs: at(start), endMs: end === null ? null : at(end) });
const summary = (spans: TimeSpan[]) => freeTimeSlots(spans, "2026-09-14").map((slot) => ({
  from: new Date(slot.startMs).toISOString(), minutes: slot.minutes, midnight: slot.endsAtMidnight,
}));

test("fills the gap between two events and the stretch after the last one", () => {
  expect(summary([span("13:00", "14:00"), span("20:00", "21:00")])).toEqual([
    { from: "2026-09-14T17:00:00.000Z", minutes: 360, midnight: false },
    { from: "2026-09-15T00:00:00.000Z", minutes: 180, midnight: true },
  ]);
});

test("the last event leaves free time until midnight, never beyond the day", () => {
  const [slot] = freeTimeSlots([span("19:00", "21:00")], "2026-09-14");
  expect(slot?.minutes).toBe(180);
  expect(slot?.endsAtMidnight).toBe(true);
  expect(slot?.endMs).toBe(new Date("2026-09-15T00:00:00-03:00").getTime());
});

test("no free time before the first event or between touching events, and none past midnight", () => {
  expect(summary([span("07:00", "08:00"), span("08:00", "09:00"), span("09:00", "23:30"), span("23:00", "23:59")]).map((s) => s.minutes)).toEqual([1]);
  expect(freeTimeSlots([{ startMs: at("22:00"), endMs: new Date("2026-09-15T06:00:00-03:00").getTime() }], "2026-09-14")).toEqual([]);
});

test("overlapping events count as one block", () => {
  expect(summary([span("09:00", "12:00"), span("10:00", "11:00"), span("13:00", "14:00")]).map((s) => s.minutes)).toEqual([60, 600]);
});

test("input order does not matter", () => {
  expect(summary([span("20:00", "21:00"), span("13:00", "14:00")]).map((s) => s.minutes)).toEqual([360, 180]);
});

test("an event with no end time stops the calculation after it", () => {
  expect(summary([span("07:00", "08:00"), span("09:00", null), span("12:00", "13:00")]).map((s) => s.minutes)).toEqual([60]);
});

test("a day without events has no free time blocks", () => {
  expect(freeTimeSlots([], "2026-09-14")).toEqual([]);
});
