import { expect, test } from "vitest";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";

test("creates a training event with server-defined timestamps and name", async () => {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const foodGateway = new StubFoodParsingGateway();
  const result = await new CreateEventUseCase(eventRepository, tagRepository, foodGateway).execute(
    {
      type: "training",
      description: "Gym session",
      tags: ["Gym"],
      data: {
        workouts: [
          { type: "running", pace: 320, distance: 5, duration: 25, calories: 320 },
        ],
      },
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  const savedEvent = await eventRepository.findById(result.eventId);

  expect(savedEvent?.userId).toBe("firebase-user-1");
  expect(savedEvent?.type).toBe("training");
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.finishedAt).toBeUndefined();
  expect(savedEvent?.interruptions).toEqual([]);
  expect(tagRepository.upsertedTags).toEqual(["gym"]);
});
