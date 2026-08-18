import { expect, test } from "vitest";
import { FoodEvent } from "../../domain/entities/food-event.entity";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { Interruption } from "../../domain/value-objects/interruption";
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

test("appends new interruptions and patches existing ones by id", async () => {
  const existingInterruption = Interruption.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    name: "Water break",
    description: "Short pause",
    startedAt: new Date("2026-08-16T18:30:00.000Z"),
    finishedAt: new Date("2026-08-16T18:32:00.000Z"),
  });
  const existingEvent = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: [],
    interruptions: [existingInterruption],
    data: { workouts: [] },
  });
  const eventRepository = new InMemoryEventRepository([existingEvent]);
  const updateUseCase = new UpdateEventUseCase(
    eventRepository,
    new InMemoryTagRepository(),
    new StubFoodParsingGateway(),
  );

  await updateUseCase.execute(
    {
      eventId: existingEvent.id,
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

test("updates food items without changing food or id", async () => {
  const existingFoodEvent = FoodEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123457",
    userId: "firebase-user-1",
    name: "Almoço",
    description: "",
    startedAt: new Date("2026-08-16T12:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: {
      inputText: "rice",
      items: [
        {
          id: "01K2R1J5M8S0Y2Z7ABCD123458",
          food: "Rice",
          portion: "100 g",
          approximateWeightGrams: 100,
          caloriesKcal: 130,
          macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2, totalFatGrams: 0, fiberGrams: 1 },
          mainMicronutrients: {},
          otherData: {},
        },
      ],
      totals: {
        totalCaloriesKcal: 130,
        totalProteinGrams: 2,
        totalCarbohydrateGrams: 28,
        totalFatGrams: 0,
        totalFiberGrams: 1,
        totalMicronutrients: {},
      },
      modelProvider: "stub",
      modelName: "stub-model",
      parsedAt: new Date("2026-08-16T12:00:00.000Z"),
    },
  });
  const eventRepository = new InMemoryEventRepository([existingFoodEvent]);
  const updateUseCase = new UpdateEventUseCase(
    eventRepository,
    new InMemoryTagRepository(),
    new StubFoodParsingGateway(),
  );

  await updateUseCase.execute(
    {
      eventId: existingFoodEvent.id,
      data: {
        items: [
          {
            id: existingFoodEvent.data.items[0].id,
            food: "Forged food name",
            portion: "200 g",
            approximateWeightGrams: 200,
            caloriesKcal: 180,
            macronutrients: { carbohydratesGrams: 36, proteinsGrams: 4, totalFatGrams: 1, fiberGrams: 2 },
            mainMicronutrients: {},
            otherData: {},
          },
          {
            food: "Beans",
            portion: "100 g",
            approximateWeightGrams: 100,
            caloriesKcal: 80,
            macronutrients: { carbohydratesGrams: 14, proteinsGrams: 5, totalFatGrams: 0, fiberGrams: 6 },
            mainMicronutrients: {},
            otherData: {},
          },
        ],
      },
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(existingFoodEvent.id);
  expect(savedEvent).toBeInstanceOf(FoodEvent);
  expect((savedEvent as FoodEvent).data.items[0]).toMatchObject({
    id: existingFoodEvent.data.items[0].id,
    food: "Rice",
    portion: "200 g",
    caloriesKcal: 180,
  });
  expect((savedEvent as FoodEvent).data.items[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
});

test("does not add unrelated data to a sleep event", async () => {
  const sleepEvent = SleepEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "firebase-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { score: 70, trackedSleepTime: 420 },
  });
  const eventRepository = new InMemoryEventRepository([sleepEvent]);
  const updateUseCase = new UpdateEventUseCase(
    eventRepository,
    new InMemoryTagRepository(),
    new StubFoodParsingGateway(),
  );

  await updateUseCase.execute(
    { eventId: sleepEvent.id, data: { items: [] } },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(sleepEvent.id);
  expect(savedEvent).toBeInstanceOf(SleepEvent);
  expect((savedEvent as SleepEvent).data).toEqual({ score: 70, trackedSleepTime: 420 });
});
