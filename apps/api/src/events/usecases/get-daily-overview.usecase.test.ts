import { expect, test } from "vitest";
import { Event, EventItem } from "@repo/entities";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryDailyOverviewQuery } from "../testing/in-memory-daily-overview.query";

const workout = { workoutCode: "free" as const, workoutName: "Livre", calories: 420, duration: 60 };

test("builds the daily overview for a Sao Paulo day", async () => {
  const database = new InMemoryEventDatabase([
    Event.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Manual entry",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      items: [EventItem.create({ position: 0, type: "sleep", schemaVersion: 1, isPrimary: true, data: { trackedSleepTime: 390, score: 88 } })],
    }),
    Event.create({
      userId: "user-1",
      name: "Leg day",
      description: "Gym session",
      startedAt: new Date("2026-08-16T18:00:00-03:00"),
      finishedAt: new Date("2026-08-16T19:00:00-03:00"),
      tags: ["gym"],
      interruptions: [],
      items: [EventItem.create({ position: 0, type: "training", schemaVersion: 1, isPrimary: true, data: { workouts: [workout], caloriesBurned: 420 } })],
    }),
    Event.create({
      userId: "user-1",
      name: "Lunch",
      description: "Rice, chicken, and beans",
      startedAt: new Date("2026-08-16T12:00:00-03:00"),
      finishedAt: new Date("2026-08-16T12:30:00-03:00"),
      tags: ["lunch"],
      interruptions: [],
      items: [
        EventItem.create({
          position: 0,
          type: "meal",
          schemaVersion: 1,
          isPrimary: true,
          data: {
            name: "Lunch",
            description: "arroz, frango e feijao",
            foodItems: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD001",
                name: "Arroz, frango e feijao",
                portion: "1 prato",
                approximateWeightGrams: 400,
                caloriesKcal: 560,
                macronutrients: { carbohydratesGrams: 58, proteinsGrams: 32, totalFatGrams: 12, fiberGrams: 8 },
                micronutrients: { ironMg: 4.1 },
              },
            ],
            totals: {
              totalCaloriesKcal: 560,
              totalProteinGrams: 32,
              totalCarbohydrateGrams: 58,
              totalFatGrams: 12,
              totalFiberGrams: 8,
            },
          },
        }),
      ],
    }),
  ]);
  const useCase = new GetDailyOverviewUseCase(new InMemoryDailyOverviewQuery(database));

  const overview = await useCase.execute({ date: "2026-08-16" }, { userId: "user-1" });

  expect(overview.caloriesConsumed).toBe(560);
  expect(overview.macros.protein).toBe(32);
  expect(overview.sleep?.score).toBe(88);
});

test("does not attribute overnight meal or training totals to the following day", async () => {
  const database = new InMemoryEventDatabase([
    Event.create({
      userId: "user-1",
      name: "Late dinner",
      description: "Dinner before midnight",
      startedAt: new Date("2026-08-16T23:30:00-03:00"),
      finishedAt: new Date("2026-08-17T00:30:00-03:00"),
      tags: [],
      interruptions: [],
      items: [
        EventItem.create({
          position: 0,
          type: "meal",
          schemaVersion: 1,
          isPrimary: true,
          data: {
            name: "Jantar",
            description: "jantar",
            foodItems: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD002",
                name: "Jantar",
                portion: "1 prato",
                approximateWeightGrams: 400,
                caloriesKcal: 700,
                macronutrients: { carbohydratesGrams: 60, proteinsGrams: 40, totalFatGrams: 20, fiberGrams: 10 },
                micronutrients: { ironMg: 5 },
              },
            ],
            totals: {
              totalCaloriesKcal: 700,
              totalProteinGrams: 40,
              totalCarbohydrateGrams: 60,
              totalFatGrams: 20,
              totalFiberGrams: 10,
            },
          },
        }),
      ],
    }),
    Event.create({
      userId: "user-1",
      name: "Late training",
      description: "Workout before midnight",
      startedAt: new Date("2026-08-16T23:30:00-03:00"),
      finishedAt: new Date("2026-08-17T00:30:00-03:00"),
      tags: [],
      interruptions: [],
      items: [
        EventItem.create({
          position: 0,
          type: "training",
          schemaVersion: 1,
          isPrimary: true,
          data: { workouts: [{ ...workout, calories: 300 }], caloriesBurned: 300 },
        }),
      ],
    }),
    Event.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Overnight sleep remains visible",
      startedAt: new Date("2026-08-16T23:00:00-03:00"),
      finishedAt: new Date("2026-08-17T07:00:00-03:00"),
      tags: [],
      interruptions: [],
      items: [EventItem.create({ position: 0, type: "sleep", schemaVersion: 1, isPrimary: true, data: { trackedSleepTime: 480, score: 90 } })],
    }),
  ]);

  const overview = await new GetDailyOverviewUseCase(new InMemoryDailyOverviewQuery(database)).execute(
    { date: "2026-08-17" },
    { userId: "user-1" },
  );

  expect(overview.caloriesConsumed).toBe(0);
  expect(overview.mealEvents).toEqual([]);
  expect(overview.trainingEvents).toEqual([]);
  expect(overview.sleep?.score).toBe(90);
});
