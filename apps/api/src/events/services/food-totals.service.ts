import type { FoodItem, FoodTotals } from "@repo/entities";

export class FoodTotalsService {
  calculate(items: FoodItem[]): FoodTotals {
    return items.reduce<FoodTotals>(
      (totals, item) => {
        totals.totalCaloriesKcal += item.caloriesKcal;
        totals.totalProteinGrams += item.macronutrients.proteinsGrams;
        totals.totalCarbohydrateGrams += item.macronutrients.carbohydratesGrams;
        totals.totalFatGrams += item.macronutrients.totalFatGrams;
        totals.totalFiberGrams += item.macronutrients.fiberGrams;

        for (const [key, value] of Object.entries(item.mainMicronutrients)) {
          totals.totalMicronutrients[key] = (totals.totalMicronutrients[key] ?? 0) + value;
        }

        return totals;
      },
      {
        totalCaloriesKcal: 0,
        totalProteinGrams: 0,
        totalCarbohydrateGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
        totalMicronutrients: {},
      },
    );
  }
}
