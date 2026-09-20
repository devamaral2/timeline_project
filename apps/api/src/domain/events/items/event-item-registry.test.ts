import { expect, test } from "vitest";
import { parseRoutineData } from "./routine-data";
import { parseMealItem } from "./meal-item";
import { parseSleepItem } from "./sleep-item";
import { parseTrainingData } from "./training-data";
import { EventItemRegistry, defaultEventItemRegistry } from "./event-item-registry";
import { EventValidationError } from "../errors/event.errors";

const validMeal = {
  name: "Almoço",
  description: "Arroz e feijão",
  foodItems: [
    {
      name: "Arroz",
      portion: "100 g",
      approximateWeightGrams: 100,
      caloriesKcal: 130,
      macronutrients: {
        carbohydratesGrams: 28,
        proteinsGrams: 2.7,
        totalFatGrams: 0.3,
        fiberGrams: 0.4,
      },
      micronutrients: { ironMilligrams: 2.1 },
    },
  ],
  totals: {
    totalCaloriesKcal: 130,
    totalProteinGrams: 2.7,
    totalCarbohydrateGrams: 28,
    totalFatGrams: 0.3,
    totalFiberGrams: 0.4,
  },
};

const validTraining = {
  workouts: [
    {
      workoutCode: "running",
      workoutName: "Corrida",
      calories: 300,
      duration: 30,
      pace: 5,
      distance: 5,
    },
  ],
  caloriesBurned: 300,
};

test("parses the four known item payloads", () => {
  expect(parseRoutineData({}, 1)).toEqual({});
  expect(() => parseRoutineData({ extra: true }, 1)).toThrow();

  expect(parseMealItem(validMeal, 1).foodItems[0].micronutrients).toEqual({
    ironMilligrams: 2.1,
  });
  expect(() => parseMealItem({ ...validMeal, foodItems: "invalid" }, 1)).toThrow();
  expect(() =>
    parseMealItem({ ...validMeal, totals: { ...validMeal.totals, totalCaloriesKcal: 1 } }, 1),
  ).toThrow("Meal totals do not match food items");

  expect(parseSleepItem({ trackedSleepTime: 480, score: 83 }, 1)).toEqual({
    trackedSleepTime: 480,
    score: 83,
  });

  expect(parseTrainingData(validTraining, 1).workouts[0].workoutName).toBe("Corrida");
});

test("rejects an unsupported schema version", () => {
  expect(() => defaultEventItemRegistry.parse("meal", validMeal, 2)).toThrow(
    "Unsupported schema version",
  );
});

test("upgrades a payload to the current schema version through a custom definition", () => {
  const versionedTestRegistry = new EventItemRegistry([
    {
      type: "test-note",
      currentSchemaVersion: 2,
      incompatibleWith: [],
      parse(data, schemaVersion) {
        if (schemaVersion !== 1 && schemaVersion !== 2) {
          throw new EventValidationError("Unsupported schema version");
        }
        const source = data as { text: string; importance?: string };
        return {
          text: source.text,
          importance: source.importance ?? "normal",
        };
      },
    },
  ]);

  const upgraded = versionedTestRegistry.parse("test-note", { text: "old" }, 1);
  expect(upgraded).toEqual({
    schemaVersion: 2,
    data: { text: "old", importance: "normal" },
  });
});
