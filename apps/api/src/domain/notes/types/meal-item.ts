import { NoteValidationError } from "../errors/note.errors";
import { type FoodItem, parseFoodItem } from "./food-item";

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

export const MEAL_RECIPE_SOURCES = ["user", "model"] as const;

/** `user`: o preparo foi dito pelo usuario; `model`: foi proposto pelo modelo. */
export type MealRecipeSource = (typeof MEAL_RECIPE_SOURCES)[number];

export interface MealRecipeIngredient {
  name: string;
  /** Texto livre: "300 g", "1 colher de sopa", "a gosto". */
  quantity: string;
}

/** Receita do prato: o que o compoe e o modo de preparo. Os nutrientes ficam em `foodItems`. */
export interface MealRecipe {
  source: MealRecipeSource;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: MealRecipeIngredient[];
  steps: string[];
}

export interface MealItem {
  /** Absent on legacy snapshots. Nutrition is estimated, never catalog-backed. */
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateMealTotals(
  foodItems: readonly Pick<FoodItem, "caloriesKcal" | "macronutrients">[],
): MealTotals {
  return foodItems.reduce<MealTotals>(
    (totals, item) => ({
      totalCaloriesKcal: round2(totals.totalCaloriesKcal + item.caloriesKcal),
      totalProteinGrams: round2(totals.totalProteinGrams + item.macronutrients.proteinsGrams),
      totalCarbohydrateGrams: round2(
        totals.totalCarbohydrateGrams + item.macronutrients.carbohydratesGrams,
      ),
      totalFatGrams: round2(totals.totalFatGrams + item.macronutrients.totalFatGrams),
      totalFiberGrams: round2(totals.totalFiberGrams + item.macronutrients.fiberGrams),
    }),
    {
      totalCaloriesKcal: 0,
      totalProteinGrams: 0,
      totalCarbohydrateGrams: 0,
      totalFatGrams: 0,
      totalFiberGrams: 0,
    },
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseMealRecipe(data: unknown): MealRecipe {
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Meal recipe must be an object");
  }
  const source = data as Record<string, unknown>;

  if (!MEAL_RECIPE_SOURCES.includes(source.source as MealRecipeSource)) {
    throw new NoteValidationError("Meal recipe source must be user or model");
  }
  if (!Array.isArray(source.ingredients)) {
    throw new NoteValidationError("Meal recipe requires an array of ingredients");
  }
  const ingredients = source.ingredients.map((entry): MealRecipeIngredient => {
    const ingredient = (entry ?? {}) as Record<string, unknown>;
    if (!isNonEmptyString(ingredient.name)) {
      throw new NoteValidationError("Meal recipe ingredient requires a name");
    }
    if (typeof ingredient.quantity !== "string") {
      throw new NoteValidationError("Meal recipe ingredient requires a quantity");
    }
    return { name: ingredient.name, quantity: ingredient.quantity };
  });
  if (!Array.isArray(source.steps) || source.steps.length === 0 || !source.steps.every(isNonEmptyString)) {
    throw new NoteValidationError("Meal recipe requires at least one preparation step");
  }

  const recipe: MealRecipe = { source: source.source as MealRecipeSource, ingredients, steps: [...source.steps] };
  if (source.servings !== undefined) {
    if (!isFiniteNonNegative(source.servings) || source.servings === 0) {
      throw new NoteValidationError("Meal recipe servings must be a positive number");
    }
    recipe.servings = source.servings;
  }
  if (source.prepTimeMinutes !== undefined) {
    if (!isFiniteNonNegative(source.prepTimeMinutes)) {
      throw new NoteValidationError("Meal recipe prepTimeMinutes must be a non-negative number");
    }
    recipe.prepTimeMinutes = source.prepTimeMinutes;
  }
  return recipe;
}

export function parseMealItem(data: unknown, schemaVersion: number): MealItem {
  if (schemaVersion !== 1) {
    throw new NoteValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Meal item must be an object");
  }

  const source = data as Record<string, unknown>;

  if (!isNonEmptyString(source.name)) {
    throw new NoteValidationError("Meal item requires a name");
  }
  if (typeof source.description !== "string") {
    throw new NoteValidationError("Meal item requires a description");
  }
  if (!Array.isArray(source.foodItems)) {
    throw new NoteValidationError("Meal item requires an array of foodItems");
  }

  const foodItems = source.foodItems.map(parseFoodItem);
  const computedTotals = calculateMealTotals(foodItems);

  const providedTotals = source.totals as Record<string, unknown> | undefined;
  if (typeof providedTotals !== "object" || providedTotals === null) {
    throw new NoteValidationError("Meal item requires totals");
  }
  for (const key of Object.keys(computedTotals) as (keyof MealTotals)[]) {
    if (round2(providedTotals[key] as number) !== computedTotals[key]) {
      throw new NoteValidationError("Meal totals do not match food items");
    }
  }

  const mealItem: MealItem = {
    name: source.name,
    description: source.description,
    foodItems,
    totals: computedTotals,
  };

  if (source.generation !== undefined) {
    const status = (source.generation as { status?: unknown } | null)?.status;
    if (status !== "pending" && status !== "completed" && status !== "failed") {
      throw new NoteValidationError("Invalid meal generation status");
    }
    if (status === "completed" && !source.recipe) {
      throw new NoteValidationError("Completed meal generation requires a recipe");
    }
    mealItem.generation = { status };
  }
  if (source.nutritionSource !== undefined) {
    if (source.nutritionSource !== "model-estimate") {
      throw new NoteValidationError("Invalid meal nutrition source");
    }
    mealItem.nutritionSource = "model-estimate";
  }

  if (isNonEmptyString(source.sourceMealId)) {
    mealItem.sourceMealId = source.sourceMealId;
  }
  if (typeof source.sourceMealRevision === "number") {
    mealItem.sourceMealRevision = source.sourceMealRevision;
  }
  if (source.recipe !== undefined && source.recipe !== null) {
    mealItem.recipe = parseMealRecipe(source.recipe);
  }

  return mealItem;
}
