import { expect, test } from "vitest";
import { resolveEventSchedule } from "./event-schedule.service";

const TIME_ZONE = "America/Sao_Paulo";
// 23:00 do dia 23/08 no horario de Sao Paulo (UTC-3).
const lateNight = new Date("2026-08-24T02:00:00.000Z");

test("leaves the event open when the phrase carried no window", () => {
  const schedule = resolveEventSchedule({}, lateNight, TIME_ZONE);

  expect(schedule.startedAt).toEqual(lateNight);
  expect(schedule.finishedAt).toBeUndefined();
});

test("closes the event after the spoken duration, crossing midnight", () => {
  const schedule = resolveEventSchedule({ durationMinutes: 360 }, lateNight, TIME_ZONE);

  expect(schedule.startedAt).toEqual(lateNight);
  expect(schedule.finishedAt?.toISOString()).toBe("2026-08-24T08:00:00.000Z");
});

test("closes the event at the next occurrence of the spoken clock time", () => {
  const schedule = resolveEventSchedule({ endTimeOfDay: "06:00" }, lateNight, TIME_ZONE);

  // 06:00 de 24/08 no horario local, ou seja, ja no dia seguinte a fala.
  expect(schedule.finishedAt?.toISOString()).toBe("2026-08-24T09:00:00.000Z");
});

test("keeps the end on the same day when it is still ahead", () => {
  const earlyMorning = new Date("2026-08-24T06:00:00.000Z");

  const schedule = resolveEventSchedule({ endTimeOfDay: "06:00" }, earlyMorning, TIME_ZONE);

  expect(schedule.finishedAt?.toISOString()).toBe("2026-08-24T09:00:00.000Z");
});

test("prefers an explicit duration over a spoken end time", () => {
  const schedule = resolveEventSchedule(
    { durationMinutes: 60, endTimeOfDay: "06:00" },
    lateNight,
    TIME_ZONE,
  );

  expect(schedule.finishedAt?.toISOString()).toBe("2026-08-24T03:00:00.000Z");
});

test("starts the event in the past when the phrase says so", () => {
  const schedule = resolveEventSchedule({ startOffsetMinutes: -20 }, lateNight, TIME_ZONE);

  expect(schedule.startedAt.toISOString()).toBe("2026-08-24T01:40:00.000Z");
});

test("ignores a start in the future", () => {
  const schedule = resolveEventSchedule({ startOffsetMinutes: 45 }, lateNight, TIME_ZONE);

  expect(schedule.startedAt).toEqual(lateNight);
});

test("resolves a spoken start time to the most recent occurrence", () => {
  const afterMidnight = new Date("2026-08-24T05:00:00.000Z");

  const schedule = resolveEventSchedule({ startTimeOfDay: "23:00" }, afterMidnight, TIME_ZONE);

  // 23:00 do dia anterior, nao as 23:00 que ainda vao chegar.
  expect(schedule.startedAt.toISOString()).toBe("2026-08-24T02:00:00.000Z");
});

test("measures the duration from the spoken start, not from now", () => {
  const afterMidnight = new Date("2026-08-24T05:00:00.000Z");

  const schedule = resolveEventSchedule(
    { startTimeOfDay: "23:00", durationMinutes: 420 },
    afterMidnight,
    TIME_ZONE,
  );

  expect(schedule.startedAt.toISOString()).toBe("2026-08-24T02:00:00.000Z");
  expect(schedule.finishedAt?.toISOString()).toBe("2026-08-24T09:00:00.000Z");
});

test("ignores windows longer than a week", () => {
  const schedule = resolveEventSchedule(
    { durationMinutes: 20_000, startOffsetMinutes: -30_000 },
    lateNight,
    TIME_ZONE,
  );

  expect(schedule.startedAt).toEqual(lateNight);
  expect(schedule.finishedAt).toBeUndefined();
});

test("ignores a malformed clock time", () => {
  const schedule = resolveEventSchedule(
    { endTimeOfDay: "manha", startTimeOfDay: "25:00" },
    lateNight,
    TIME_ZONE,
  );

  expect(schedule.startedAt).toEqual(lateNight);
  expect(schedule.finishedAt).toBeUndefined();
});
