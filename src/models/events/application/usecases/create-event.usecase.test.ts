import { expect, test } from "vitest";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";

test("creates a training event for the authenticated owner and upserts tags", async () => {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const foodGateway = new StubFoodParsingGateway();
  const result = await new CreateEventUseCase(eventRepository, tagRepository, foodGateway).execute(
    {
      type: "training",
      name: "Leg day",
      description: "Gym session",
      startedAt: "2026-08-16T18:00:00-03:00",
      finishedAt: "2026-08-16T19:00:00-03:00",
      tags: ["Gym", "Legs"],
      interruptions: [],
      data: { caloriesBurned: 420 },
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(tagRepository.upsertedTags).toEqual(["gym", "legs"]);
});
