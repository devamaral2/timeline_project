import { ulid } from "ulid";
import { calculateMealTotals, type EventItemFoodItem, type MealTotals } from "@repo/entities";
import type { ParsedMealFoodItem } from "../gateways/meal-parsing.gateway";

export class MealTotalsService {
  toFoodItems(items: readonly ParsedMealFoodItem[]): EventItemFoodItem[] {
    return items.map((item) => ({
      id: ulid(),
      name: item.food,
      portion: item.portion,
      approximateWeightGrams: item.approximateWeightGrams,
      caloriesKcal: item.caloriesKcal,
      macronutrients: { ...item.macronutrients },
      micronutrients: mergeMicronutrients(item.mainMicronutrients, item.otherData),
    }));
  }

  calculate(foodItems: readonly EventItemFoodItem[]): MealTotals {
    return calculateMealTotals(foodItems);
  }
}

function mergeMicronutrients(
  first: Record<string, number>,
  second: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...first };
  for (const [key, value] of Object.entries(second)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}
