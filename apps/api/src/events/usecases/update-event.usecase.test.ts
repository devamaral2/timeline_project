import { expect, test } from "vitest";
import { Event, EventItem, Interruption } from "@repo/entities";
import { UpdateEventUseCase } from "./update-event.usecase";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";

function trainingEvent(id: string, interruptions: Interruption[] = []) {
  return Event.create({
    id,
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: ["gym"],
    interruptions,
    items: [
      EventItem.create({
        position: 0,
        type: "training",
        schemaVersion: 1,
        isPrimary: true,
        data: {
          workouts: [{ id: "01K2R1J5M8S0Y2Z7ABCDFREEWK", workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }],
          caloriesBurned: 420,
        },
      }),
    ],
  });
}

test("updates an event without requiring startedAt in the payload", async () => {
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123456");
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const updateUseCase = new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog());

  await expect(
    updateUseCase.execute(
      {
        eventId: existingEvent.id,
        expectedRevision: 1,
        description: "Updated description",
        tags: ["focus"],
      },
      { userId: "firebase-user-1" },
    ),
  ).resolves.toBeUndefined();

  const savedEvent = await eventRepository.findById(existingEvent.id);
  expect(savedEvent?.description).toBe("Updated description");
  expect(savedEvent?.tags).toEqual(["focus"]);
  expect(savedEvent?.revision).toBe(2);
});

test("appends new interruptions and patches existing ones by id", async () => {
  const existingInterruption = Interruption.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    name: "Water break",
    description: "Short pause",
    startedAt: new Date("2026-08-16T18:30:00.000Z"),
    finishedAt: new Date("2026-08-16T18:32:00.000Z"),
  });
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123456", [existingInterruption]);
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const updateUseCase = new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog());

  await updateUseCase.execute(
    {
      eventId: existingEvent.id,
      expectedRevision: 1,
      interruptions: [
        { id: existingInterruption.id, description: "Updated pause" },
        { name: "Phone call" },
      ],
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(existingEvent.id);
  expect(savedEvent?.interruptions).toHaveLength(2);
  expect(savedEvent?.interruptions[0]).toMatchObject({
    id: existingInterruption.id,
    name: "Water break",
    description: "Updated pause",
  });
  expect(
    savedEvent!.interruptions[1].finishedAt.getTime() - savedEvent!.interruptions[1].startedAt.getTime(),
  ).toBe(120000);
});

test("replaces meal items and recalculates totals", async () => {
  const mealItemId = "01K2R1J5M8S0Y2Z7ABCD123458";
  const existingEvent = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123457",
    userId: "firebase-user-1",
    name: "Almoço",
    description: "",
    startedAt: new Date("2026-08-16T12:00:00.000Z"),
    tags: [],
    interruptions: [],
    items: [
      EventItem.create({
        id: mealItemId,
        position: 0,
        type: "meal",
        schemaVersion: 1,
        isPrimary: true,
        data: {
          name: "Almoço",
          description: "rice",
          foodItems: [
            {
              id: "01K2R1J5M8S0Y2Z7ABCDFOOD001",
              name: "Rice",
              portion: "100 g",
              approximateWeightGrams: 100,
              caloriesKcal: 130,
              macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2, totalFatGrams: 0, fiberGrams: 1 },
              micronutrients: {},
            },
          ],
          totals: {
            totalCaloriesKcal: 130,
            totalProteinGrams: 2,
            totalCarbohydrateGrams: 28,
            totalFatGrams: 0,
            totalFiberGrams: 1,
          },
        },
      }),
    ],
  });
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const updateUseCase = new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog());

  await updateUseCase.execute(
    {
      eventId: existingEvent.id,
      expectedRevision: 1,
      items: [
        {
          id: mealItemId,
          type: "meal",
          schemaVersion: 1,
          isPrimary: true,
          data: {
            name: "Almoço",
            description: "rice and beans",
            foodItems: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD001",
                name: "Rice",
                portion: "200 g",
                approximateWeightGrams: 200,
                caloriesKcal: 180,
                macronutrients: { carbohydratesGrams: 36, proteinsGrams: 4, totalFatGrams: 1, fiberGrams: 2 },
                micronutrients: {},
              },
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD002",
                name: "Beans",
                portion: "100 g",
                approximateWeightGrams: 100,
                caloriesKcal: 80,
                macronutrients: { carbohydratesGrams: 14, proteinsGrams: 5, totalFatGrams: 0, fiberGrams: 6 },
                micronutrients: {},
              },
            ],
            totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
          },
        },
      ],
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(existingEvent.id);
  const mealData = savedEvent?.items[0].data as {
    foodItems: Array<{ id: string; portion: string; caloriesKcal: number }>;
    totals: { totalCaloriesKcal: number };
  };
  expect(savedEvent?.items[0].id).toBe(mealItemId);
  expect(mealData.foodItems[0]).toMatchObject({ id: "01K2R1J5M8S0Y2Z7ABCDFOOD001", portion: "200 g", caloriesKcal: 180 });
  expect(mealData.foodItems[1].id).toBe("01K2R1J5M8S0Y2Z7ABCDFOOD002");
  expect(mealData.totals.totalCaloriesKcal).toBe(260);
});

test("updates sleep metrics without retaining unrelated data", async () => {
  const sleepEvent = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "firebase-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    items: [
      EventItem.create({ position: 0, type: "sleep", schemaVersion: 1, isPrimary: true, data: { score: 70, trackedSleepTime: 420 } }),
    ],
  });
  const database = new InMemoryEventDatabase([sleepEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const updateUseCase = new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog());

  await updateUseCase.execute(
    {
      eventId: sleepEvent.id,
      expectedRevision: 1,
      items: [{ type: "sleep", schemaVersion: 1, isPrimary: true, data: { score: 85, trackedSleepTime: 420 } }],
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(sleepEvent.id);
  expect(savedEvent?.items[0].data).toEqual({ score: 85, trackedSleepTime: 420 });
});

test("rejects an expectedRevision that does not match the stored event", async () => {
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123460");
  const database = new InMemoryEventDatabase([existingEvent]);
  const eventRepository = new InMemoryEventRepository(database);
  const updateUseCase = new UpdateEventUseCase(eventRepository, new InMemoryWorkoutCatalog());

  await expect(
    updateUseCase.execute(
      { eventId: existingEvent.id, expectedRevision: 5, description: "x" },
      { userId: "firebase-user-1" },
    ),
  ).rejects.toThrow();
});
