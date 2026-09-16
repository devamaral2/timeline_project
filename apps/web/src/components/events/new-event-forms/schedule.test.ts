import { expect, test } from "vitest";
import { initialSchedule, previewOccurrences, ScheduleError, submissionOf, type ScheduleState } from "./schedule";

const payload = { name: "Correr", items: [{ type: "routine" as const }] };

function schedule(overrides: Partial<ScheduleState>): ScheduleState {
  return { ...initialSchedule(), startedAt: "2026-09-15T07:00", ...overrides };
}

test("a single event carries its own window", () => {
  const submission = submissionOf(payload, schedule({ finishedAt: "2026-09-15T07:30" }));

  expect(submission.url).toBe("/api/events");
  expect(submission.body).toMatchObject({
    name: "Correr",
    startedAt: new Date("2026-09-15T07:00").toISOString(),
    finishedAt: new Date("2026-09-15T07:30").toISOString(),
  });
});

test("a repeating event becomes a series with the event as its template", () => {
  const submission = submissionOf(
    payload,
    schedule({ finishedAt: "2026-09-15T07:30", repeat: "weekly", weekdays: [1, 3], endsOn: "2026-12-31" }),
  );

  expect(submission.url).toBe("/api/recurrences");
  expect(submission.body).toMatchObject({
    target: "event",
    frequency: "weekly",
    interval: 1,
    byWeekday: 0b1010,
    durationMinutes: 30,
    timeZone: "America/Sao_Paulo",
    endsOn: "2026-12-31",
    template: payload,
  });
  expect(submission.body).not.toHaveProperty("startedAt");
});

test("weekly without weekdays repeats on the weekday it starts", () => {
  const submission = submissionOf(payload, schedule({ repeat: "weekly", startedAt: "2026-09-15T12:00" }));
  // 15/09/2026 e uma terca (bit 2).
  expect(submission.body).toMatchObject({ byWeekday: 0b100 });
});

test("monthly and yearly take the day (and month) from the start", () => {
  expect(submissionOf(payload, schedule({ repeat: "monthly", startedAt: "2026-09-20T12:00" })).body).toMatchObject({
    byMonthDay: 20,
  });
  expect(submissionOf(payload, schedule({ repeat: "yearly", startedAt: "2026-09-20T12:00" })).body).toMatchObject({
    byMonthDay: 20,
    byMonth: 9,
  });
});

test("refuses an end before the start", () => {
  expect(() => submissionOf(payload, schedule({ finishedAt: "2026-09-15T06:00" }))).toThrow(ScheduleError);
  expect(() => submissionOf(payload, schedule({ repeat: "daily", finishedAt: "2026-09-15T06:00" }))).toThrow(
    ScheduleError,
  );
});

test("previews the next occurrences of the rule", () => {
  expect(previewOccurrences(schedule({ repeat: "daily", interval: 2, startedAt: "2026-09-15T12:00" }))).toEqual([
    "2026-09-15",
    "2026-09-17",
    "2026-09-19",
  ]);
  expect(previewOccurrences(schedule({}))).toEqual([]);
});
