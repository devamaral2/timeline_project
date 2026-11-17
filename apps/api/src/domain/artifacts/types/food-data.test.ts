import { describe, expect, test } from "vitest";
import { ArtifactValidationError } from "../errors/artifact.errors";
import { EMPTY_FOOD_TOTALS, calculateFoodTotals, parseFoodData, parseFoodItem, parseFoodRecipe } from "./food-data";

const rice = {
  id: "item-rice",
  name: "Arroz",
  portion: "100 g",
  approximateWeightGrams: 100,
  caloriesKcal: 130,
  macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.7, totalFatGrams: 0.3, fiberGrams: 0.4 },
};
const beans = {
  id: "item-beans",
  name: "Feijão",
  portion: "1 concha",
  approximateWeightGrams: 80,
  caloriesKcal: 76.5,
  macronutrients: { carbohydratesGrams: 13.6, proteinsGrams: 4.8, totalFatGrams: 0.5, fiberGrams: 8.5 },
};
const riceAndBeansTotals = {
  totalCaloriesKcal: 206.5,
  totalProteinGrams: 7.5,
  totalCarbohydrateGrams: 41.6,
  totalFatGrams: 0.8,
  totalFiberGrams: 8.9,
};
const ownTotals = {
  totalCaloriesKcal: 89,
  totalProteinGrams: 1.1,
  totalCarbohydrateGrams: 22.8,
  totalFatGrams: 0.3,
  totalFiberGrams: 2.6,
};
const recipe = {
  source: "user",
  servings: 2,
  prepTimeMinutes: 25,
  ingredients: [{ name: "Arroz", quantity: "1 xícara" }],
  steps: ["Refogar", "Cozinhar por 15 minutos"],
};

function food(overrides: Record<string, unknown> = {}) {
  return { description: "arroz e feijão", items: [rice, beans], totals: riceAndBeansTotals, ...overrides };
}

describe("parseFoodData", () => {
  test("parses a food made of items", () => {
    expect(parseFoodData(food(), 1)).toEqual({
      description: "arroz e feijão",
      items: [rice, beans],
      totals: riceAndBeansTotals,
    });
  });

  test("keeps only the keys of the food", () => {
    const parsed = parseFoodData(food({ name: "Almoço", micronutrients: { iron: 1 } }), 1);

    expect(parsed).not.toHaveProperty("name");
    expect(parsed).not.toHaveProperty("micronutrients");
  });

  test("rejects an unsupported schema version and data that is not an object", () => {
    expect(() => parseFoodData(food(), 2)).toThrow("Unsupported schema version");
    expect(() => parseFoodData(null, 1)).toThrow("Food data must be an object");
    expect(() => parseFoodData("arroz", 1)).toThrow("Food data must be an object");
  });

  test("requires a description, which may be empty", () => {
    expect(() => parseFoodData(food({ description: undefined }), 1)).toThrow("Food requires a description");
    expect(parseFoodData(food({ description: "" }), 1).description).toBe("");
  });

  test("requires the list of items", () => {
    expect(() => parseFoodData(food({ items: undefined }), 1)).toThrow("Food requires an array of items");
  });

  describe("totals", () => {
    test("must match the sum of the items", () => {
      const off = { ...riceAndBeansTotals, totalCaloriesKcal: 200 };

      expect(() => parseFoodData(food({ totals: off }), 1)).toThrow("Food totals do not match its items");
      expect(() => parseFoodData(food({ totals: { ...riceAndBeansTotals, totalFiberGrams: 9 } }), 1)).toThrow(
        ArtifactValidationError,
      );
      expect(() => parseFoodData(food({ totals: EMPTY_FOOD_TOTALS }), 1)).toThrow("Food totals do not match its items");
    });

    test("are compared with two decimal places", () => {
      const parsed = parseFoodData(food({ totals: { ...riceAndBeansTotals, totalCaloriesKcal: 206.5004 } }), 1);

      expect(parsed.totals.totalCaloriesKcal).toBe(206.5);
    });

    test("are free when the food has no items: they are the food's own", () => {
      const parsed = parseFoodData(food({ items: [], totals: ownTotals }), 1);

      expect(parsed.items).toEqual([]);
      expect(parsed.totals).toEqual(ownTotals);
    });

    test("are rounded to two decimal places when the food has no items", () => {
      const parsed = parseFoodData(food({ items: [], totals: { ...ownTotals, totalProteinGrams: 1.126 } }), 1);

      expect(parsed.totals.totalProteinGrams).toBe(1.13);
    });

    test("are required, complete and non-negative, with or without items", () => {
      const { totalFiberGrams: _fiber, ...incomplete } = ownTotals;

      expect(() => parseFoodData(food({ totals: undefined }), 1)).toThrow("Food requires totals");
      expect(() => parseFoodData(food({ items: [], totals: null }), 1)).toThrow("Food requires totals");
      expect(() => parseFoodData(food({ items: [], totals: incomplete }), 1)).toThrow(
        "Food totals.totalFiberGrams must be a non-negative number",
      );
      expect(() => parseFoodData(food({ items: [], totals: { ...ownTotals, totalFatGrams: -1 } }), 1)).toThrow(
        "Food totals.totalFatGrams must be a non-negative number",
      );
      expect(() =>
        parseFoodData(food({ items: [], totals: { ...ownTotals, totalCaloriesKcal: Number.POSITIVE_INFINITY } }), 1),
      ).toThrow(ArtifactValidationError);
    });
  });

  describe("quantity", () => {
    test("is the trimmed text of how much was eaten", () => {
      expect(parseFoodData(food({ quantity: "  2 pratos " }), 1).quantity).toBe("2 pratos");
    });

    test("is left out when blank", () => {
      expect(parseFoodData(food({ quantity: "   " }), 1)).not.toHaveProperty("quantity");
    });

    test("must be a text", () => {
      expect(() => parseFoodData(food({ quantity: 2 }), 1)).toThrow("Food quantity must be a text");
    });
  });

  describe("recipe", () => {
    test("is kept with its optional fields", () => {
      expect(parseFoodData(food({ recipe }), 1).recipe).toEqual(recipe);
    });

    test("is absent when null or not given", () => {
      expect(parseFoodData(food({ recipe: null }), 1)).not.toHaveProperty("recipe");
      expect(parseFoodData(food(), 1)).not.toHaveProperty("recipe");
    });

    test("is validated", () => {
      expect(() => parseFoodData(food({ recipe: { ...recipe, steps: [] } }), 1)).toThrow(
        "Food recipe requires at least one preparation step",
      );
    });
  });

  describe("generation", () => {
    test("accepts pending and failed without nutrients", () => {
      const empty = { items: [], totals: EMPTY_FOOD_TOTALS };

      expect(parseFoodData(food({ ...empty, generation: { status: "pending" } }), 1).generation).toEqual({
        status: "pending",
      });
      expect(parseFoodData(food({ ...empty, generation: { status: "failed" } }), 1).generation).toEqual({
        status: "failed",
      });
    });

    test("completed requires a recipe", () => {
      expect(() => parseFoodData(food({ generation: { status: "completed" } }), 1)).toThrow(
        "Completed food generation requires a recipe",
      );
      expect(parseFoodData(food({ generation: { status: "completed" }, recipe }), 1).generation).toEqual({
        status: "completed",
      });
    });

    test("keeps only the status", () => {
      const parsed = parseFoodData(food({ generation: { status: "pending", requestedAt: "2026-01-01" } }), 1);

      expect(parsed.generation).toEqual({ status: "pending" });
    });

    test("rejects an unknown state", () => {
      expect(() => parseFoodData(food({ generation: { status: "running" } }), 1)).toThrow(
        "Invalid food generation status",
      );
      expect(() => parseFoodData(food({ generation: null }), 1)).toThrow("Invalid food generation status");
      expect(() => parseFoodData(food({ generation: {} }), 1)).toThrow(ArtifactValidationError);
    });

    test("is absent on a food nobody asked the agent about", () => {
      expect(parseFoodData(food(), 1)).not.toHaveProperty("generation");
    });
  });

  describe("nutritionSource", () => {
    test("only records a model estimate", () => {
      expect(parseFoodData(food({ nutritionSource: "model-estimate" }), 1).nutritionSource).toBe("model-estimate");
      expect(parseFoodData(food(), 1)).not.toHaveProperty("nutritionSource");
      expect(() => parseFoodData(food({ nutritionSource: "label" }), 1)).toThrow("Invalid food nutrition source");
    });
  });
});

describe("parseFoodItem", () => {
  test("keeps the id it came with and creates one when missing", () => {
    const { id: _id, ...withoutId } = rice;

    expect(parseFoodItem(rice).id).toBe("item-rice");
    expect(parseFoodItem(withoutId).id).toMatch(/^[0-9A-Z]{26}$/);
    expect(parseFoodItem({ ...rice, id: "" }).id).toMatch(/^[0-9A-Z]{26}$/);
  });

  test("keeps only the fields of an item", () => {
    expect(parseFoodItem({ ...rice, micronutrients: { iron: 2 } })).toEqual(rice);
  });

  test("requires a name, a portion and non-negative numbers", () => {
    expect(() => parseFoodItem(null)).toThrow("Food item must be an object");
    expect(() => parseFoodItem({ ...rice, name: "" })).toThrow("Food item requires a name");
    expect(() => parseFoodItem({ ...rice, portion: undefined })).toThrow("Food item requires a portion");
    expect(() => parseFoodItem({ ...rice, approximateWeightGrams: -1 })).toThrow(
      "Food item requires a non-negative approximateWeightGrams",
    );
    expect(() => parseFoodItem({ ...rice, caloriesKcal: "130" })).toThrow("Food item requires non-negative caloriesKcal");
  });

  test("requires every macronutrient", () => {
    const { fiberGrams: _fiber, ...incomplete } = rice.macronutrients;

    expect(() => parseFoodItem({ ...rice, macronutrients: undefined })).toThrow("Food item requires macronutrients");
    expect(() => parseFoodItem({ ...rice, macronutrients: incomplete })).toThrow(
      "Food item macronutrients.fiberGrams must be a non-negative number",
    );
    expect(() => parseFoodItem({ ...rice, macronutrients: { ...rice.macronutrients, proteinsGrams: -2 } })).toThrow(
      "Food item macronutrients.proteinsGrams must be a non-negative number",
    );
  });

  test("an invalid item invalidates the whole food", () => {
    expect(() => parseFoodData(food({ items: [rice, { ...beans, name: "" }] }), 1)).toThrow("Food item requires a name");
  });
});

describe("parseFoodRecipe", () => {
  test("accepts a recipe told by the user or proposed by the model", () => {
    expect(parseFoodRecipe({ ...recipe, source: "model" }).source).toBe("model");
    expect(parseFoodRecipe(recipe).source).toBe("user");
    expect(() => parseFoodRecipe({ ...recipe, source: "web" })).toThrow("Food recipe source must be user or model");
  });

  test("leaves the optional fields out when they were not given", () => {
    const parsed = parseFoodRecipe({ source: "user", ingredients: [], steps: ["Servir"] });

    expect(parsed).toEqual({ source: "user", ingredients: [], steps: ["Servir"] });
  });

  test("requires named ingredients with a text quantity, which may be empty", () => {
    const withIngredients = (ingredients: unknown) => () => parseFoodRecipe({ ...recipe, ingredients });

    expect(withIngredients(undefined)).toThrow("Food recipe requires an array of ingredients");
    expect(withIngredients([{ quantity: "1" }])).toThrow("Food recipe ingredient requires a name");
    expect(withIngredients([{ name: "Sal" }])).toThrow("Food recipe ingredient requires a quantity");
    expect(withIngredients([null])).toThrow("Food recipe ingredient requires a name");
    expect(parseFoodRecipe({ ...recipe, ingredients: [{ name: "Sal", quantity: "", brand: "x" }] }).ingredients).toEqual([
      { name: "Sal", quantity: "" },
    ]);
  });

  test("requires at least one non-empty preparation step", () => {
    expect(() => parseFoodRecipe({ ...recipe, steps: undefined })).toThrow(
      "Food recipe requires at least one preparation step",
    );
    expect(() => parseFoodRecipe({ ...recipe, steps: ["Refogar", ""] })).toThrow(ArtifactValidationError);
  });

  test("validates servings and preparation time", () => {
    expect(() => parseFoodRecipe({ ...recipe, servings: 0 })).toThrow("Food recipe servings must be a positive number");
    expect(() => parseFoodRecipe({ ...recipe, servings: -1 })).toThrow("Food recipe servings must be a positive number");
    expect(() => parseFoodRecipe({ ...recipe, prepTimeMinutes: -5 })).toThrow(
      "Food recipe prepTimeMinutes must be a non-negative number",
    );
    expect(parseFoodRecipe({ ...recipe, prepTimeMinutes: 0 }).prepTimeMinutes).toBe(0);
  });

  test("rejects a recipe that is not an object", () => {
    expect(() => parseFoodRecipe("misturar tudo")).toThrow("Food recipe must be an object");
  });
});

describe("calculateFoodTotals", () => {
  test("is zero for no items", () => {
    expect(calculateFoodTotals([])).toEqual(EMPTY_FOOD_TOTALS);
  });

  test("sums the items, rounding away floating point noise", () => {
    expect(calculateFoodTotals([rice, beans])).toEqual(riceAndBeansTotals);

    const tenth = { caloriesKcal: 0.1, macronutrients: { carbohydratesGrams: 0.1, proteinsGrams: 0.1, totalFatGrams: 0.1, fiberGrams: 0.1 } };
    const fifth = { caloriesKcal: 0.2, macronutrients: { carbohydratesGrams: 0.2, proteinsGrams: 0.2, totalFatGrams: 0.2, fiberGrams: 0.2 } };
    expect(calculateFoodTotals([tenth, fifth]).totalCaloriesKcal).toBe(0.3);
  });

  test("does not change the shared empty totals", () => {
    calculateFoodTotals([rice]);

    expect(EMPTY_FOOD_TOTALS.totalCaloriesKcal).toBe(0);
  });
});
