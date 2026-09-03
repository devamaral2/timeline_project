import { expect, test } from "vitest";
import { Event, EventItem } from "@repo/entities";
import { CreateEventUseCase } from "./create-event.usecase";
import { DeleteEventUseCase } from "./delete-event.usecase";
import { UpdateEventUseCase } from "./update-event.usecase";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../testing/stub-meal-parsing.gateway";
import type { MealParsingGateway } from "../gateways/meal-parsing.gateway";

function openTrainingEvent(id: string, startedAt: Date) {
  return Event.create({
    id,
    userId: "firebase-user-1",
    name: "Treino",
    description: "",
    startedAt,
    tags: [],
    interruptions: [],
    items: [
      EventItem.create({ position: 0, type: "training", schemaVersion: 1, isPrimary: true, data: { workouts: [], caloriesBurned: 0 } }),
    ],
  });
}

test("creates a training event with server-defined timestamps and name", async () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const result = await new CreateEventUseCase(
    eventRepository,
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
    undefined,
    () => now,
  ).execute(
    {
      description: "Gym session",
      tags: ["Gym"],
      items: [{ type: "training", data: { workouts: [{ workoutCode: "running", pace: 320, distance: 5, duration: 25, calories: 320 }] } }],
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  const savedEvent = await eventRepository.findById(result.eventId);

  expect(savedEvent?.userId).toBe("firebase-user-1");
  expect(savedEvent?.items[0].type).toBe("training");
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.startedAt).toEqual(now);
  expect(savedEvent?.finishedAt).toBeUndefined();
  expect(savedEvent?.interruptions).toEqual([]);
  expect(savedEvent?.tags).toEqual(["gym"]);
});

test("creates a sleep event with the fixed name and default optional data", async () => {
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const result = await new CreateEventUseCase(
    eventRepository,
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
  ).execute({ items: [{ type: "sleep" }] }, { userId: "firebase-user-1" });

  const savedEvent = await eventRepository.findById(result.eventId);

  expect(savedEvent?.name).toBe("Sono");
  expect(savedEvent?.items[0]).toMatchObject({
    type: "sleep",
    data: { trackedSleepTime: 0, score: 0 },
  });
});

test("keeps routine names supplied by the user", async () => {
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const result = await new CreateEventUseCase(
    eventRepository,
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
  ).execute({ name: "Planejamento", items: [{ type: "routine" }] }, { userId: "firebase-user-1" });

  expect((await eventRepository.findById(result.eventId))?.name).toBe("Planejamento");
});

test("requires a name when the primary item is routine", async () => {
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const useCase = new CreateEventUseCase(eventRepository, new StubMealParsingGateway(), new InMemoryWorkoutCatalog());

  await expect(
    useCase.execute({ items: [{ type: "routine" }] }, { userId: "firebase-user-1" }),
  ).rejects.toThrow("Event requires a name");
});

test("finishes the latest open event before creating a new one", async () => {
  const openEvent = openTrainingEvent("01K2TESTOPENEVENT1234567890", new Date("2026-08-17T08:00:00-03:00"));
  const database = new InMemoryEventDatabase([openEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const useCase = new CreateEventUseCase(eventRepository, new StubMealParsingGateway(), new InMemoryWorkoutCatalog());
  const beforeCreate = new Date();

  const result = await useCase.execute(
    { name: "Planejamento", items: [{ type: "routine" }] },
    { userId: "firebase-user-1" },
  );
  const updatedOpenEvent = await eventRepository.findById(openEvent.id);

  expect(updatedOpenEvent?.finishedAt).toBeInstanceOf(Date);
  expect(updatedOpenEvent?.finishedAt?.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
  expect(result.eventId).toBeDefined();
});

test("keeps the previous event open when meal parsing fails", async () => {
  const openEvent = openTrainingEvent("01K2TESTOPENFAILURE12345678", new Date("2026-08-17T08:00:00-03:00"));
  const database = new InMemoryEventDatabase([openEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const failingGateway: MealParsingGateway = {
    parseMeal: async () => {
      throw new Error("meal parsing failed");
    },
  };
  const useCase = new CreateEventUseCase(eventRepository, failingGateway, new InMemoryWorkoutCatalog());

  await expect(
    useCase.execute({ items: [{ type: "meal", data: { inputText: "banana" } }] }, { userId: "firebase-user-1" }),
  ).rejects.toThrow("meal parsing failed");

  await expect(eventRepository.findById(openEvent.id)).resolves.toMatchObject({
    finishedAt: undefined,
  });
});

test("prevents a different user from updating an existing event", async () => {
  const existingEvent = openTrainingEvent("01K2R1J5M8S0Y2Z7ABCD123456", new Date("2026-08-16T18:00:00-03:00"));
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);

  await expect(
    new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog()).execute(
      { eventId: existingEvent.id, expectedRevision: 1 },
      { userId: "firebase-user-2" },
    ),
  ).rejects.toThrow("Only the event owner can modify it");
});

test("deletes an event when the authenticated user is the owner", async () => {
  const existingEvent = openTrainingEvent("01K2R1J5M8S0Y2Z7ABCD123457", new Date("2026-08-16T06:00:00-03:00"));
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);

  await new DeleteEventUseCase(eventRepository).execute(
    { eventId: existingEvent.id },
    { userId: "firebase-user-1" },
  );

  await expect(eventRepository.findById(existingEvent.id)).resolves.toBeNull();
});

test("creates a meal event from parsed AI items and calculated totals", async () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const useCase = new CreateEventUseCase(
    eventRepository,
    new StubMealParsingGateway({
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
    new InMemoryWorkoutCatalog(),
    undefined,
    () => now,
  );

  const result = await useCase.execute(
    {
      description: "Banana, iogurte e morango",
      tags: ["Breakfast"],
      items: [{ type: "meal", data: { inputText: "1 banana. 2 colheres de iogurte natural e 5 morangos" } }],
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toBeDefined();
  const savedEvent = await eventRepository.findById(result.eventId);
  const mealItem = savedEvent?.items[0];

  expect(mealItem?.type).toBe("meal");
  expect(mealItem?.data).toMatchObject({
    description: "1 banana. 2 colheres de iogurte natural e 5 morangos",
    totals: {
      totalCaloriesKcal: 134,
      totalProteinGrams: 4.1,
      totalCarbohydrateGrams: 26.8,
      totalFatGrams: 1.8,
      totalFiberGrams: 2.6,
    },
  });

  expect(savedEvent?.startedAt).toEqual(now);
  const foodItems = (mealItem?.data as { foodItems: Array<{ id: string; micronutrients: Record<string, number> }> }).foodItems;
  expect(foodItems[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(foodItems[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(foodItems[0].micronutrients).toMatchObject({ potassiumMg: 358, magnesiumMg: 27, sodiumMg: 1 });
  expect(savedEvent?.tags).toEqual(["breakfast"]);
});
