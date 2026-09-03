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
  mainMicronutrients: Record<string, number>;
  otherData: Record<string, number>;
}

export interface MealParsingGateway {
  parseMeal(input: { text: string }): Promise<{
    items: ParsedMealFoodItem[];
    modelProvider: string;
    modelName: string;
  }>;
}
