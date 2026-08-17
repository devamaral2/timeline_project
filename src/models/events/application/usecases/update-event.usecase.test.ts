import { expect, test } from "vitest";
import { TrainingEvent } from "../../domain/entities/training-event.entity";
import { UpdateEventUseCase } from "./update-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";

test("updates an event without requiring type or startedAt in the payload", async () => {
  const existingEvent = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });
  const eventRepository = new InMemoryEventRepository([existingEvent]);
  const updateUseCase = new UpdateEventUseCase(
    eventRepository,
    new InMemoryTagRepository(),
    new StubFoodParsingGateway(),
  );

  await expect(
    updateUseCase.execute(
      {
        eventId: existingEvent.id,
        description: "Updated description",
        tags: ["focus"],
      },
      { userId: "firebase-user-1" },
    ),
  ).resolves.toBeUndefined();
});
