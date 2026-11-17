import type { FoodRecipe } from "../../../domain/index";

export interface ParsedFoodItem {
  food: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: {
    carbohydratesGrams: number;
    proteinsGrams: number;
    totalFatGrams: number;
    fiberGrams: number;
  };
}

export interface FoodParsingGateway {
  parseFood(input: { text: string }): Promise<{
    items: ParsedFoodItem[];
    /** Providers must return a recipe; worker rejects legacy/stub responses without one. */
    recipe?: FoodRecipe;
    modelProvider: string;
    modelName: string;
  }>;
}
