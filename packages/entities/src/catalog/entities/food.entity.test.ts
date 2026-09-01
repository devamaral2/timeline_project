import { expect, test } from "vitest";
import { Food } from "./food.entity";

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

test("rejects a global entry with an owner", () => {
  expect(() =>
    Food.create({ ...foodProps, scope: "global", ownerUserId: "user-1" }),
  ).toThrow("Global catalog entries cannot have an owner");
});

test("rejects a private entry without an owner", () => {
  expect(() =>
    Food.create({ ...foodProps, scope: "user", ownerUserId: undefined }),
  ).toThrow("Private catalog entries require an owner");
});

test("scales a snapshot by the requested portion and increments revision on revise", () => {
  const food = Food.create({ ...foodProps, scope: "user", ownerUserId: "user-1" });

  const snapshot = food.toFoodItem({ portion: "200 g", approximateWeightGrams: 200 });
  expect(snapshot.caloriesKcal).toBe(260);
  expect(snapshot.sourceFoodId).toBe(food.id);
  expect(snapshot.sourceFoodRevision).toBe(food.revision);

  const changedFood = food.revise({ caloriesKcal: 150 });
  expect(changedFood.revision).toBe(food.revision + 1);
  expect(snapshot.caloriesKcal).toBe(260);
});
