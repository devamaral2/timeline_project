import { expect, test } from "vitest";
import { TrainingEvent } from "../../domain/entities/training-event.entity";
import { mergeEventUpdate } from "./event-update-merger.service";

test("replaces training workouts and assigns ids to new nested records", () => {
  const event = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["old"],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });

  const updatedEvent = mergeEventUpdate(
    event,
    {
      eventId: event.id,
      tags: ["new"],
      data: {
        workouts: [
          {
            type: "weightlifting",
            calories: 300,
            duration: 45,
            sets: [{ exercise: "Squat", repetitions: 10, weight: 80 }],
          },
        ],
      },
    },
    new Date("2026-08-17T12:00:00.000Z"),
  );

  expect(updatedEvent.tags).toEqual(["new"]);
  expect(updatedEvent).toBeInstanceOf(TrainingEvent);
  const workout = (updatedEvent as TrainingEvent).data.workouts[0];
  expect(workout).toMatchObject({ type: "weightlifting", calories: 300, duration: 45 });
  expect(workout.id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  if (workout.type !== "weightlifting") throw new Error("Expected weightlifting workout");
  expect(workout.sets[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
});
