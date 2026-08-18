import { expect, test } from "vitest";
import { SleepEvent } from "../../../../domain/entities/sleep-event.entity";
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

test("preserves server-derived fields for an open sleep event", () => {
  const event = SleepEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123460",
    userId: "user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-17T08:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { trackedSleepTime: 0, score: 0 },
  });

  const document = EventDocumentMapper.toPersistence(event);
  const restored = EventDocumentMapper.toDomain(document);

  expect(document).toMatchObject({
    name: "Sono",
    startedAt: "2026-08-17T08:00:00.000Z",
    interruptions: [],
  });
  expect(document).not.toHaveProperty("finishedAt");
  expect(restored).toMatchObject({ name: "Sono", interruptions: [] });
  expect(restored.finishedAt).toBeUndefined();
  expect(restored.startedAt.toISOString()).toBe("2026-08-17T08:00:00.000Z");
});
