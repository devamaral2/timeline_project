import { expect, test } from "vitest";
import { Food } from "./food.entity";
import { Meal } from "./meal.entity";
import { calculateMealTotals } from "../../events/items/meal-item";

const foodProps = {
  name: "Arroz",
  referencePortion: "100 g",
  referenceWeightGrams: 100,
  caloriesKcal: 130,
  macronutrients: {
    carbohydratesGrams: 28,
    proteinsGrams: 2.7,
    totalFatGrams: 0.3,
    fiberGrams: 0.4,
  },
  micronutrients: { ironMilligrams: 1.5 },
};

const mealProps = {
  scope: "user" as const,
  ownerUserId: "user-1",
  name: "Almoço",
  description: "Arroz e feijão",
};

test("computes totals from food items and recomputes them on revise", () => {
  const food = Food.create({ ...foodProps, scope: "user", ownerUserId: "user-1" });
  const snapshot = food.toFoodItem({ portion: "200 g", approximateWeightGrams: 200 });

  const meal = Meal.create({ ...mealProps, foodItems: [snapshot] });
  expect(meal.totals).toEqual(calculateMealTotals([snapshot]));

  const eventSnapshot = meal.toMealItem();
  expect(eventSnapshot.name).toBe(meal.name);
  expect(eventSnapshot.foodItems[0]).not.toBe(snapshot);

  const changedMeal = meal.revise({ name: "Nova receita" });
  expect(changedMeal.revision).toBe(meal.revision + 1);
});
