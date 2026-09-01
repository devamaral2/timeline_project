import { EventValidationError } from "../errors/event.errors";
import { type FoodItem, parseFoodItem } from "./food-item";

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

export interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateMealTotals(foodItems: readonly FoodItem[]): MealTotals {
  return foodItems.reduce<MealTotals>(
    (totals, item) => ({
      totalCaloriesKcal: round2(totals.totalCaloriesKcal + item.caloriesKcal),
      totalProteinGrams: round2(totals.totalProteinGrams + item.macronutrients.proteinsGrams),
      totalCarbohydrateGrams: round2(
        totals.totalCarbohydrateGrams + item.macronutrients.carbohydratesGrams,
      ),
      totalFatGrams: round2(totals.totalFatGrams + item.macronutrients.totalFatGrams),
      totalFiberGrams: round2(totals.totalFiberGrams + item.macronutrients.fiberGrams),
    }),
    {
      totalCaloriesKcal: 0,
      totalProteinGrams: 0,
      totalCarbohydrateGrams: 0,
      totalFatGrams: 0,
      totalFiberGrams: 0,
    },
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseMealItem(data: unknown, schemaVersion: number): MealItem {
  if (schemaVersion !== 1) {
    throw new EventValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new EventValidationError("Meal item must be an object");
  }

  const source = data as Record<string, unknown>;

  if (!isNonEmptyString(source.name)) {
    throw new EventValidationError("Meal item requires a name");
  }
  if (typeof source.description !== "string") {
    throw new EventValidationError("Meal item requires a description");
  }
  if (!Array.isArray(source.foodItems)) {
    throw new EventValidationError("Meal item requires an array of foodItems");
  }

  const foodItems = source.foodItems.map(parseFoodItem);
  const computedTotals = calculateMealTotals(foodItems);

  const providedTotals = source.totals as Record<string, unknown> | undefined;
  if (typeof providedTotals !== "object" || providedTotals === null) {
    throw new EventValidationError("Meal item requires totals");
  }
  for (const key of Object.keys(computedTotals) as (keyof MealTotals)[]) {
    if (round2(providedTotals[key] as number) !== computedTotals[key]) {
      throw new EventValidationError("Meal totals do not match food items");
    }
  }

  const mealItem: MealItem = {
    name: source.name,
    description: source.description,
    foodItems,
    totals: computedTotals,
  };

  if (isNonEmptyString(source.sourceMealId)) {
    mealItem.sourceMealId = source.sourceMealId;
  }
  if (typeof source.sourceMealRevision === "number") {
    mealItem.sourceMealRevision = source.sourceMealRevision;
  }

  return mealItem;
}
