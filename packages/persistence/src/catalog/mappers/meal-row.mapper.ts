import {
  Meal,
  EventValidationError,
  calculateMealTotals,
  type CatalogScope,
  type EventItemFoodItem as FoodItem,
} from "@repo/entities";

export interface MealRow {
  id: string;
  scope: CatalogScope;
  ownerUserId: string | null;
  revision: number;
  name: string;
  description: string;
  foodItems: unknown;
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  createdAt: Date;
  updatedAt: Date;
}

export function mapMealRow(row: MealRow): Meal {
  const foodItems = row.foodItems as FoodItem[];
  const computedTotals = calculateMealTotals(foodItems);
  const storedTotals = {
    totalCaloriesKcal: row.totalCaloriesKcal,
    totalProteinGrams: row.totalProteinGrams,
    totalCarbohydrateGrams: row.totalCarbohydrateGrams,
    totalFatGrams: row.totalFatGrams,
    totalFiberGrams: row.totalFiberGrams,
  };

  for (const key of Object.keys(computedTotals) as (keyof typeof computedTotals)[]) {
    if (computedTotals[key] !== storedTotals[key]) {
      throw new EventValidationError(
        `Meal ${row.id} has stale totals: stored ${JSON.stringify(storedTotals)} does not match computed ${JSON.stringify(computedTotals)}`,
      );
    }
  }

  return Meal.create({
    id: row.id,
    scope: row.scope,
    ownerUserId: row.ownerUserId ?? undefined,
    name: row.name,
    description: row.description,
    foodItems,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
