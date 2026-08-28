import { describe, expect, test } from "vitest";
import { FoodEvent } from "./food-event.entity";
import { RoutineEvent } from "./routine-event.entity";
import { SleepEvent } from "./sleep-event.entity";
import { TrainingEvent } from "./training-event.entity";
import { Interruption } from "../value-objects/interruption";

describe("Event entities", () => {
  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      TrainingEvent.create({
        userId: "user-1",
        name: "Run",
        description: "Morning run",
        startedAt: new Date("2026-08-16T09:00:00-03:00"),
        finishedAt: new Date("2026-08-16T08:00:00-03:00"),
        tags: ["cardio"],
        interruptions: [],
        data: { workouts: [{ type: "free", calories: 250, duration: 30 }] },
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("keeps trackedSleepTime independent from the event duration", () => {
    const sleepEvent = SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Imported manually",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      data: { trackedSleepTime: 6.5, score: 88 },
    });

    expect(sleepEvent.data.trackedSleepTime).toBe(6.5);
    expect(sleepEvent.getDurationMinutes()).toBe(480);
  });

  test("rejects an interruption ending before it starts", () => {
    expect(() =>
      Interruption.create({
        name: "Coffee break",
        description: "Short pause",
        startedAt: new Date("2026-08-16T09:00:00-03:00"),
        finishedAt: new Date("2026-08-16T08:00:00-03:00"),
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("assigns ids to interruptions", () => {
    const interruption = Interruption.create({
      name: "Coffee break",
      description: "Short pause",
      startedAt: new Date("2026-08-16T09:00:00-03:00"),
      finishedAt: new Date("2026-08-16T09:15:00-03:00"),
    });

    expect(interruption.id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  });

  test("assigns ids to nested food items", () => {
    const foodEvent = FoodEvent.create({
      userId: "user-1",
      name: "Breakfast",
      description: "Fruit and yogurt",
      startedAt: new Date("2026-08-16T08:00:00-03:00"),
      tags: ["food"],
      interruptions: [],
      data: {
        inputText: "Banana and yogurt",
        items: [
          {
            food: "Banana",
            portion: "1 unit",
            approximateWeightGrams: 100,
            caloriesKcal: 89,
            macronutrients: {
              carbohydratesGrams: 22.8,
              proteinsGrams: 1.1,
              totalFatGrams: 0.3,
              fiberGrams: 2.6,
            },
            mainMicronutrients: {},
            otherData: {},
          },
        ],
        totals: {
          totalCaloriesKcal: 89,
          totalProteinGrams: 1.1,
          totalCarbohydrateGrams: 22.8,
          totalFatGrams: 0.3,
          totalFiberGrams: 2.6,
          totalMicronutrients: {},
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T08:00:00-03:00"),
      },
    });

    expect(foodEvent.data.items[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  });

  test("assigns ids to workouts and workout sets", () => {
    const trainingEvent = TrainingEvent.create({
      userId: "user-1",
      name: "Leg day",
      description: "Gym session",
      startedAt: new Date("2026-08-16T18:00:00-03:00"),
      tags: ["gym"],
      interruptions: [],
      data: {
        workouts: [
          {
            type: "weightlifting",
            calories: 420,
            duration: 60,
            sets: [{ exercise: "Squat", repetitions: 8, weight: 100 }],
          },
          {
            type: "running",
            calories: 300,
            duration: 30,
            pace: 5.2,
            distance: 5.8,
          },
        ],
      },
    });

    expect(trainingEvent.data.workouts[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
    expect(trainingEvent.data.workouts[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
    expect(trainingEvent.data.workouts[0].type).toBe("weightlifting");
    if (trainingEvent.data.workouts[0].type !== "weightlifting") {
      throw new Error("expected weightlifting workout");
    }
    expect(trainingEvent.data.workouts[0].sets[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  });

  test("hydrates legacy training data while preserving calories burned", () => {
    const trainingEvent = TrainingEvent.create({
      userId: "user-1",
      name: "Legacy training",
      description: "Imported before workouts existed",
      startedAt: new Date("2026-08-16T18:00:00-03:00"),
      tags: [],
      interruptions: [],
      data: { caloriesBurned: 420 },
    });

    expect(trainingEvent.data.caloriesBurned).toBe(420);
    expect(trainingEvent.data.workouts).toEqual([]);
  });
});

/**
 * Nenhum evento gravado antes da marca de nao realizado a tem no documento, e
 * nao ha migracao: a entidade e que precisa continuar de pe sem ela.
 */
describe("Event marks", () => {
  test("never marks an event as missed on its own", () => {
    // A marca e uma anotacao do usuario. Nenhuma combinacao de horario a liga
    // sozinha — nem um evento que ja terminou, nem um que ficou aberto.
    const ended = RoutineEvent.create({
      userId: "user-1",
      name: "Bloco de trabalho",
      description: "",
      startedAt: new Date("2026-08-16T09:00:00-03:00"),
      finishedAt: new Date("2026-08-16T11:00:00-03:00"),
      tags: [],
      interruptions: [],
      data: {},
    });
    const open = RoutineEvent.create({
      userId: "user-1",
      name: "Bloco de trabalho",
      description: "",
      startedAt: new Date("2026-08-16T09:00:00-03:00"),
      tags: [],
      interruptions: [],
      data: {},
    });

    expect(ended.missed).toBe(false);
    expect(open.missed).toBe(false);
    expect(ended.priority).toBe("normal");
  });

  test("keeps what the caller chose", () => {
    const event = RoutineEvent.create({
      userId: "user-1",
      name: "Consulta",
      description: "",
      startedAt: new Date("2026-08-16T09:00:00-03:00"),
      finishedAt: new Date("2026-08-16T10:00:00-03:00"),
      tags: [],
      interruptions: [],
      data: {},
      missed: true,
      priority: "urgent",
    });

    expect(event.missed).toBe(true);
    expect(event.priority).toBe("urgent");
  });
});
