import { expect, test } from "vitest";
import { Event, EventItem } from "@repo/entities";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import { mergeEventUpdate } from "./event-update-merger.service";

const workoutCatalog = new InMemoryWorkoutCatalog();

function trainingEvent(workouts: unknown[], caloriesBurned: number) {
  return Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["old"],
    interruptions: [],
    items: [
      EventItem.create({
        position: 0,
        type: "training",
        schemaVersion: 1,
        isPrimary: true,
        data: { workouts, caloriesBurned },
      }),
    ],
  });
}

test("replaces training workouts and assigns ids to new nested records", async () => {
  const event = trainingEvent(
    [{ id: "01K2R1J5M8S0Y2Z7ABCDFREEWK", workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }],
    420,
  );

  const updatedEvent = await mergeEventUpdate(
    event,
    {
      eventId: event.id,
      expectedRevision: 1,
      tags: ["new"],
      items: [
        {
          type: "training",
          schemaVersion: 1,
          isPrimary: true,
          data: {
            workouts: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDLIFTWK",
                workoutCode: "weightlifting",
                workoutName: "ignored",
                calories: 300,
                duration: 45,
                sets: [{ id: "01K2R1J5M8S0Y2Z7ABCDSET001", exercise: "Squat", repetitions: 10, weight: 80 }],
              },
            ],
            caloriesBurned: 300,
          },
        },
      ],
    },
    workoutCatalog,
    new Date("2026-08-17T12:00:00.000Z"),
  );

  expect(updatedEvent.tags).toEqual(["new"]);
  expect(updatedEvent.revision).toBe(2);
  const item = updatedEvent.items[0];
  expect(item.type).toBe("training");
  const data = item.data as { workouts: Array<{ workoutCode: string; workoutName: string; calories: number; duration: number; id: string; sets: Array<{ id: string }> }> };
  const workout = data.workouts[0];
  expect(workout).toMatchObject({ workoutCode: "weightlifting", workoutName: "Musculação", calories: 300, duration: 45 });
  expect(workout.id).toBe("01K2R1J5M8S0Y2Z7ABCDLIFTWK");
  expect(workout.sets[0].id).toBe("01K2R1J5M8S0Y2Z7ABCDSET001");
});

test("preserves existing items when an update does not replace them", async () => {
  const event = trainingEvent(
    [{ id: "01K2R1J5M8S0Y2Z7ABCDFREEWK", workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }],
    420,
  );

  const updated = await mergeEventUpdate(
    event,
    { eventId: event.id, expectedRevision: 1, description: "Imported workout" },
    workoutCatalog,
    new Date("2026-08-16T19:00:00.000Z"),
  );

  expect(updated.description).toBe("Imported workout");
  expect(updated.items).toEqual(event.items);
});
