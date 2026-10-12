import type { MealRecipe } from "../../../domain";

export interface ParsedMealFoodItem {
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

export interface MealParsingGateway {
  parseMeal(input: { text: string }): Promise<{
    items: ParsedMealFoodItem[];
    /** Ausente quando o modelo nao devolveu uma receita utilizavel. */
    recipe?: MealRecipe;
    modelProvider: string;
    modelName: string;
  }>;
}
