import { expect, test } from "vitest";
import { TrainingEvent } from "../../../../domain/entities/training-event.entity";
import { EventDocumentMapper } from "./event-document.mapper";

test("maps a training event to and from persistence", () => {
  const event = TrainingEvent.create({
    userId: "user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    finishedAt: new Date("2026-08-16T19:00:00-03:00"),
    tags: ["gym", "legs"],
    interruptions: [],
    data: { caloriesBurned: 420 },
  });

  const document = EventDocumentMapper.toPersistence(event);
  const restored = EventDocumentMapper.toDomain(document);

  expect(document.type).toBe("training");
  expect(restored).toBeInstanceOf(TrainingEvent);
  expect(restored.tags).toEqual(["gym", "legs"]);
});
