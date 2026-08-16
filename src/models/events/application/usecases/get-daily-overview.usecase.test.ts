import { expect, test } from "vitest";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { SleepEvent } from "@/models/events/domain/entities/sleep-event.entity";
import { TrainingEvent } from "@/models/events/domain/entities/training-event.entity";
import { FoodEvent } from "@/models/events/domain/entities/food-event.entity";

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
      data: { caloriesBurned: 420 },
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
  expect(overview.caloriesBurned).toBe(420);
  expect(overview.macros.protein).toBe(32);
  expect(overview.sleep?.score).toBe(88);
});
