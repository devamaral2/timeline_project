export interface FoodItemMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

export interface FoodItem {
  id: string;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodItemMacronutrients;
  /**
   * @deprecated Micronutrientes deixaram de existir. A API ainda devolve `{}`
   * (o app Android antigo o exige); quem escreve pode omitir. Sera removido.
   */
  micronutrients?: Record<string, number>;
}
