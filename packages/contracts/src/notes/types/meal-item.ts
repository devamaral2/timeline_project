import type { FoodItem } from "./food-item";

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

/** `user`: o preparo foi dito pelo usuario; `model`: foi proposto pelo modelo (a UI mostra "Sugerido"). */
export type MealRecipeSource = "user" | "model";

export interface MealRecipeIngredient {
  name: string;
  /** Texto livre: "300 g", "1 colher de sopa", "a gosto". */
  quantity: string;
}

export interface MealRecipe {
  source: MealRecipeSource;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: MealRecipeIngredient[];
  /** Modo de preparo, um passo por item. */
  steps: string[];
}

export interface MealItem {
  /** Absent on legacy meal snapshots. */
  generation?: { status: "pending" | "completed" | "failed" };
  nutritionSource?: "model-estimate";
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
  recipe?: MealRecipe;
}
