import { expect, test } from "vitest";
import { CreateEventUseCase } from "./create-event.usecase";
import { DeleteEventUseCase } from "./delete-event.usecase";
import { UpdateEventUseCase } from "./update-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";
import { FoodEvent } from "../../domain/entities/food-event.entity";
import { TrainingEvent } from "../../domain/entities/training-event.entity";

const workout = {
  type: "free" as const,
  calories: 420,
  duration: 60,
};

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

test("finishes the latest open event before creating a new one", async () => {
  const openEvent = TrainingEvent.create({
    id: "01K2TESTOPENEVENT1234567890",
    userId: "firebase-user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-17T08:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { workouts: [] },
  });
  const eventRepository = new InMemoryEventRepository([openEvent]);
  const tagRepository = new InMemoryTagRepository();
  const foodGateway = new StubFoodParsingGateway();
  const useCase = new CreateEventUseCase(eventRepository, tagRepository, foodGateway);
  const beforeCreate = new Date();

  const result = await useCase.execute(
    { type: "routine", name: "Planejamento" },
    { userId: "firebase-user-1" },
  );
  const updatedOpenEvent = await eventRepository.findById(openEvent.id);

  expect(updatedOpenEvent?.finishedAt).toBeInstanceOf(Date);
  expect(updatedOpenEvent?.finishedAt?.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
  expect(result.eventId).toBeDefined();
});

test("prevents a different user from updating an existing event", async () => {
  const existingEvent = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    finishedAt: new Date("2026-08-16T19:00:00-03:00"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [workout] },
  });

  const eventRepository = new InMemoryEventRepository([existingEvent]);
  const tagRepository = new InMemoryTagRepository();
  const foodGateway = new StubFoodParsingGateway();

  await expect(
    new UpdateEventUseCase(eventRepository, tagRepository, foodGateway).execute(
      {
        eventId: existingEvent.id,
      },
      { userId: "firebase-user-2" },
    ),
  ).rejects.toThrow("Only the event owner can modify it");
});

test("deletes an event when the authenticated user is the owner", async () => {
  const existingEvent = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123457",
    userId: "firebase-user-1",
    name: "Run",
    description: "Track session",
    startedAt: new Date("2026-08-16T06:00:00-03:00"),
    finishedAt: new Date("2026-08-16T06:45:00-03:00"),
    tags: ["cardio"],
    interruptions: [],
    data: { workouts: [{ ...workout, calories: 380 }] },
  });

  const eventRepository = new InMemoryEventRepository([existingEvent]);

  await new DeleteEventUseCase(eventRepository).execute(
    { eventId: existingEvent.id },
    { userId: "firebase-user-1" },
  );

  await expect(eventRepository.findById(existingEvent.id)).resolves.toBeNull();
});

test("creates a food event from parsed AI items and calculated totals", async () => {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const useCase = new CreateEventUseCase(
    eventRepository,
    tagRepository,
    new StubFoodParsingGateway({
      items: [
        {
          food: "Banana prata",
          portion: "1 unidade media",
          approximateWeightGrams: 100,
          caloriesKcal: 89,
          macronutrients: {
            carbohydratesGrams: 22.8,
            proteinsGrams: 1.1,
            totalFatGrams: 0.3,
            fiberGrams: 2.6,
          },
          mainMicronutrients: {
            potassiumMg: 358,
            magnesiumMg: 27,
          },
          otherData: {
            sodiumMg: 1,
          },
        },
        {
          food: "Iogurte natural tradicional",
          portion: "2 colheres de sopa",
          approximateWeightGrams: 40,
          caloriesKcal: 45,
          macronutrients: {
            carbohydratesGrams: 4,
            proteinsGrams: 3,
            totalFatGrams: 1.5,
            fiberGrams: 0,
          },
          mainMicronutrients: {
            calciumMg: 48,
          },
          otherData: {
            sodiumMg: 18,
          },
        },
      ],
      modelProvider: "openrouter",
      modelName: "test-model",
    }),
  );

  const result = await useCase.execute(
    {
      type: "food",
      description: "Banana, iogurte e morango",
      tags: ["Breakfast"],
      inputText: "1 banana. 2 colheres de iogurte natural e 5 morangos",
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toBeDefined();
  expect((await eventRepository.findById(result.eventId))?.type).toBe("food");
  expect((await eventRepository.findById(result.eventId))?.data).toMatchObject({
    totals: {
      totalCaloriesKcal: 134,
      totalProteinGrams: 4.1,
      totalCarbohydrateGrams: 26.8,
      totalFatGrams: 1.8,
      totalFiberGrams: 2.6,
      totalMicronutrients: {
        potassiumMg: 358,
        magnesiumMg: 27,
        calciumMg: 48,
      },
    },
    modelProvider: "openrouter",
    modelName: "test-model",
    inputText: "1 banana. 2 colheres de iogurte natural e 5 morangos",
  });
  const savedEvent = await eventRepository.findById(result.eventId);

  expect(savedEvent?.type).toBe("food");
  if (!(savedEvent instanceof FoodEvent)) throw new Error("Expected a food event");
  expect(savedEvent.data.items[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(savedEvent.data.items[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(tagRepository.upsertedTags).toEqual(["breakfast"]);
});
