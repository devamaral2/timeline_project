import { expect, test } from "vitest";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { SleepEvent } from "@/models/events/domain/entities/sleep-event.entity";
import { TrainingEvent } from "@/models/events/domain/entities/training-event.entity";
import { FoodEvent } from "@/models/events/domain/entities/food-event.entity";

const workout = {
  type: "free" as const,
  calories: 420,
  duration: 60,
};

test("builds the daily overview for a Sao Paulo day", async () => {
  const repository = new InMemoryEventRepository([
    SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Manual entry",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      data: { trackedSleepTime: 6.5, score: 88 },
    }),
    TrainingEvent.create({
      userId: "user-1",
      name: "Leg day",
      description: "Gym session",
      startedAt: new Date("2026-08-16T18:00:00-03:00"),
      finishedAt: new Date("2026-08-16T19:00:00-03:00"),
      tags: ["gym"],
      interruptions: [],
      data: { workouts: [workout] },
    }),
    FoodEvent.create({
      userId: "user-1",
      name: "Lunch",
      description: "Rice, chicken, and beans",
      startedAt: new Date("2026-08-16T12:00:00-03:00"),
      finishedAt: new Date("2026-08-16T12:30:00-03:00"),
      tags: ["lunch"],
      interruptions: [],
      data: {
        inputText: "arroz, frango e feijao",
        items: [],
        totals: {
          totalCaloriesKcal: 560,
          totalProteinGrams: 32,
          totalCarbohydrateGrams: 58,
          totalFatGrams: 12,
          totalFiberGrams: 8,
          totalMicronutrients: { ironMg: 4.1 },
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T12:00:00-03:00"),
      },
    }),
  ]);
  const useCase = new GetDailyOverviewUseCase(repository);

  const overview = await useCase.execute({
    date: "2026-08-16",
    timeZone: "America/Sao_Paulo",
  });

  expect(overview.caloriesConsumed).toBe(560);
  expect(overview.macros.protein).toBe(32);
  expect(overview.sleep?.score).toBe(88);
});

test("does not attribute overnight food or training totals to the following day", async () => {
  const repository = new InMemoryEventRepository([
    FoodEvent.create({
      userId: "user-1",
      name: "Late dinner",
      description: "Dinner before midnight",
      startedAt: new Date("2026-08-16T23:30:00-03:00"),
      finishedAt: new Date("2026-08-17T00:30:00-03:00"),
      tags: [],
      interruptions: [],
      data: {
        inputText: "jantar",
        items: [],
        totals: {
          totalCaloriesKcal: 700,
          totalProteinGrams: 40,
          totalCarbohydrateGrams: 60,
          totalFatGrams: 20,
          totalFiberGrams: 10,
          totalMicronutrients: { ironMg: 5 },
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T23:30:00-03:00"),
      },
    }),
    TrainingEvent.create({
      userId: "user-1",
      name: "Late training",
      description: "Workout before midnight",
      startedAt: new Date("2026-08-16T23:30:00-03:00"),
      finishedAt: new Date("2026-08-17T00:30:00-03:00"),
      tags: [],
      interruptions: [],
      data: { workouts: [{ ...workout, calories: 300 }] },
    }),
    SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Overnight sleep remains visible",
      startedAt: new Date("2026-08-16T23:00:00-03:00"),
      finishedAt: new Date("2026-08-17T07:00:00-03:00"),
      tags: [],
      interruptions: [],
      data: { trackedSleepTime: 8, score: 90 },
    }),
  ]);

  const overview = await new GetDailyOverviewUseCase(repository).execute({
    date: "2026-08-17",
    timeZone: "America/Sao_Paulo",
  });

  expect(overview.caloriesConsumed).toBe(0);
  expect(overview.foodEvents).toEqual([]);
  expect(overview.trainingEvents).toEqual([]);
  expect(overview.sleep?.score).toBe(90);
});
