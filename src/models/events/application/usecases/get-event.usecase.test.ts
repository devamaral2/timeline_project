import { expect, test } from "vitest";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { TrainingEvent } from "../../domain/entities/training-event.entity";
import { GetEventUseCase } from "./get-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";

test("returns the full type-specific data for the event owner", async () => {
  const event = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });
  const useCase = new GetEventUseCase(new InMemoryEventRepository([event]));

  const result = await useCase.execute({ eventId: event.id }, { userId: "firebase-user-1" });

  expect(result).toMatchObject({
    type: "training",
    id: event.id,
    name: "Treino",
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });
});

test("returns null when the event does not exist", async () => {
  const useCase = new GetEventUseCase(new InMemoryEventRepository([]));

  const result = await useCase.execute({ eventId: "missing" }, { userId: "firebase-user-1" });

  expect(result).toBeNull();
});

test("rejects reading an event that belongs to another user", async () => {
  const event = SleepEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "firebase-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { score: 70, trackedSleepTime: 420 },
  });
  const useCase = new GetEventUseCase(new InMemoryEventRepository([event]));

  await expect(useCase.execute({ eventId: event.id }, { userId: "attacker-1" })).rejects.toThrow(
    "Only the event owner can modify it",
  );
});
