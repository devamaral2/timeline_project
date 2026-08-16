import { describe, expect, test } from "vitest";
import { SleepEvent } from "./sleep-event.entity";
import { TrainingEvent } from "./training-event.entity";

describe("Event entities", () => {
  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      TrainingEvent.create({
        userId: "user-1",
        name: "Run",
        description: "Morning run",
        startedAt: new Date("2026-08-16T09:00:00-03:00"),
        finishedAt: new Date("2026-08-16T08:00:00-03:00"),
        tags: ["cardio"],
        interruptions: [],
        data: { caloriesBurned: 250 },
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("keeps trackedSleepTime independent from the event duration", () => {
    const sleepEvent = SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Imported manually",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      data: { trackedSleepTime: 6.5, score: 88 },
    });

    expect(sleepEvent.data.trackedSleepTime).toBe(6.5);
    expect(sleepEvent.getDurationMinutes()).toBe(480);
  });
});
