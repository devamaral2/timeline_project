import { expect, test } from "vitest";
import { Event, EventItem } from "@repo/entities";
import { GetEventUseCase } from "./get-event.usecase";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";

test("returns the aggregate detail with items and revision for the event owner", async () => {
  const event = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    items: [
      EventItem.create({
        position: 0,
        type: "training",
        schemaVersion: 1,
        isPrimary: true,
        data: { workouts: [{ workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }], caloriesBurned: 420 },
      }),
    ],
  });
  const useCase = new GetEventUseCase(new InMemoryEventRepository(new InMemoryEventDatabase([event])));

  const result = await useCase.execute({ eventId: event.id }, { userId: "firebase-user-1" });

  expect(result).toMatchObject({
    id: event.id,
    name: "Treino",
    revision: 1,
    primaryItemId: event.items[0].id,
    items: [
      {
        type: "training",
        isPrimary: true,
        data: { workouts: [{ workoutCode: "free", calories: 420, duration: 60 }] },
      },
    ],
  });
});

test("returns null when the event does not exist", async () => {
  const useCase = new GetEventUseCase(new InMemoryEventRepository(new InMemoryEventDatabase([])));

  const result = await useCase.execute({ eventId: "missing" }, { userId: "firebase-user-1" });

  expect(result).toBeNull();
});

test("rejects reading an event that belongs to another user", async () => {
  const event = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "firebase-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    items: [EventItem.create({ position: 0, type: "sleep", schemaVersion: 1, isPrimary: true, data: { score: 70, trackedSleepTime: 420 } })],
  });
  const useCase = new GetEventUseCase(new InMemoryEventRepository(new InMemoryEventDatabase([event])));

  await expect(useCase.execute({ eventId: event.id }, { userId: "attacker-1" })).rejects.toThrow(
    "Only the event owner can modify it",
  );
});
