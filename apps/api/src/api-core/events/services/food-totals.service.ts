import { ulid } from "ulid";
import { calculateFoodTotals, type FoodItem, type FoodTotals } from "../../../domain";
import type { ParsedFoodItem } from "../gateways/food-parsing.gateway";

export class FoodTotalsService {
  toFoodItems(items: readonly ParsedFoodItem[]): FoodItem[] {
    return items.map((item) => ({
      id: ulid(),
      name: item.food,
      portion: item.portion,
      approximateWeightGrams: item.approximateWeightGrams,
      caloriesKcal: item.caloriesKcal,
      macronutrients: { ...item.macronutrients },
    }));
  }

  calculate(foodItems: readonly FoodItem[]): FoodTotals {
    return calculateFoodTotals(foodItems);
  }
}
