import { ulid } from "ulid";
import { ArtifactValidationError } from "../errors/artifact.errors";

export interface FoodItemMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

/** Uma parte do alimento, com os nutrientes dela: o arroz de um prato feito. */
export interface FoodItem {
  id: string;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodItemMacronutrients;
}

export interface FoodTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

export const FOOD_RECIPE_SOURCES = ["user", "model"] as const;

/** `user`: o preparo foi dito pelo usuario; `model`: foi proposto pelo modelo. */
export type FoodRecipeSource = (typeof FOOD_RECIPE_SOURCES)[number];

export interface FoodRecipeIngredient {
  name: string;
  /** Texto livre: "300 g", "1 colher de sopa", "a gosto". */
  quantity: string;
}

/** Receita do alimento: o que o compoe e o modo de preparo. Os nutrientes ficam em `items`. */
export interface FoodRecipe {
  source: FoodRecipeSource;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: FoodRecipeIngredient[];
  steps: string[];
}

/**
 * Um alimento: calorias e receita. Nao se distingue alimento de refeicao, e o
 * nome e o do artefato. Com `items`, os totais sao a soma deles; sem `items`,
 * os totais sao do proprio alimento.
 */
export interface FoodData {
  description: string;
  /** Quanto foi comido. So existe na copia que um evento ganha. */
  quantity?: string;
  items: FoodItem[];
  totals: FoodTotals;
  recipe?: FoodRecipe;
  /** Do servidor: o estado do pedido de construcao que calcula os nutrientes. */
  generation?: { status: "pending" | "completed" | "failed" };
  nutritionSource?: "model-estimate";
}

const TOTAL_KEYS = [
  "totalCaloriesKcal",
  "totalProteinGrams",
  "totalCarbohydrateGrams",
  "totalFatGrams",
  "totalFiberGrams",
] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export const EMPTY_FOOD_TOTALS: FoodTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};

export function calculateFoodTotals(items: readonly Pick<FoodItem, "caloriesKcal" | "macronutrients">[]): FoodTotals {
  return items.reduce<FoodTotals>(
    (totals, item) => ({
      totalCaloriesKcal: round2(totals.totalCaloriesKcal + item.caloriesKcal),
      totalProteinGrams: round2(totals.totalProteinGrams + item.macronutrients.proteinsGrams),
      totalCarbohydrateGrams: round2(totals.totalCarbohydrateGrams + item.macronutrients.carbohydratesGrams),
      totalFatGrams: round2(totals.totalFatGrams + item.macronutrients.totalFatGrams),
      totalFiberGrams: round2(totals.totalFiberGrams + item.macronutrients.fiberGrams),
    }),
    { ...EMPTY_FOOD_TOTALS },
  );
}

export function parseFoodItem(data: unknown): FoodItem {
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Food item must be an object");
  }
  const source = data as Record<string, unknown>;

  if (!isNonEmptyString(source.name)) throw new ArtifactValidationError("Food item requires a name");
  if (!isNonEmptyString(source.portion)) throw new ArtifactValidationError("Food item requires a portion");
  if (!isFiniteNonNegative(source.approximateWeightGrams)) {
    throw new ArtifactValidationError("Food item requires a non-negative approximateWeightGrams");
  }
  if (!isFiniteNonNegative(source.caloriesKcal)) {
    throw new ArtifactValidationError("Food item requires non-negative caloriesKcal");
  }
  const macronutrients = source.macronutrients as Record<string, unknown> | undefined;
  if (typeof macronutrients !== "object" || macronutrients === null) {
    throw new ArtifactValidationError("Food item requires macronutrients");
  }
  for (const key of ["carbohydratesGrams", "proteinsGrams", "totalFatGrams", "fiberGrams"] as const) {
    if (!isFiniteNonNegative(macronutrients[key])) {
      throw new ArtifactValidationError(`Food item macronutrients.${key} must be a non-negative number`);
    }
  }

  return {
    id: isNonEmptyString(source.id) ? source.id : ulid(),
    name: source.name,
    portion: source.portion,
    approximateWeightGrams: source.approximateWeightGrams,
    caloriesKcal: source.caloriesKcal,
    macronutrients: {
      carbohydratesGrams: macronutrients.carbohydratesGrams as number,
      proteinsGrams: macronutrients.proteinsGrams as number,
      totalFatGrams: macronutrients.totalFatGrams as number,
      fiberGrams: macronutrients.fiberGrams as number,
    },
  };
}

export function parseFoodRecipe(data: unknown): FoodRecipe {
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Food recipe must be an object");
  }
  const source = data as Record<string, unknown>;

  if (!FOOD_RECIPE_SOURCES.includes(source.source as FoodRecipeSource)) {
    throw new ArtifactValidationError("Food recipe source must be user or model");
  }
  if (!Array.isArray(source.ingredients)) {
    throw new ArtifactValidationError("Food recipe requires an array of ingredients");
  }
  const ingredients = source.ingredients.map((entry): FoodRecipeIngredient => {
    const ingredient = (entry ?? {}) as Record<string, unknown>;
    if (!isNonEmptyString(ingredient.name)) {
      throw new ArtifactValidationError("Food recipe ingredient requires a name");
    }
    if (typeof ingredient.quantity !== "string") {
      throw new ArtifactValidationError("Food recipe ingredient requires a quantity");
    }
    return { name: ingredient.name, quantity: ingredient.quantity };
  });
  if (!Array.isArray(source.steps) || source.steps.length === 0 || !source.steps.every(isNonEmptyString)) {
    throw new ArtifactValidationError("Food recipe requires at least one preparation step");
  }

  const recipe: FoodRecipe = { source: source.source as FoodRecipeSource, ingredients, steps: [...source.steps] };
  if (source.servings !== undefined) {
    if (!isFiniteNonNegative(source.servings) || source.servings === 0) {
      throw new ArtifactValidationError("Food recipe servings must be a positive number");
    }
    recipe.servings = source.servings;
  }
  if (source.prepTimeMinutes !== undefined) {
    if (!isFiniteNonNegative(source.prepTimeMinutes)) {
      throw new ArtifactValidationError("Food recipe prepTimeMinutes must be a non-negative number");
    }
    recipe.prepTimeMinutes = source.prepTimeMinutes;
  }
  return recipe;
}

export function parseFoodData(data: unknown, schemaVersion: number): FoodData {
  if (schemaVersion !== 1) throw new ArtifactValidationError("Unsupported schema version");
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Food data must be an object");
  }
  const source = data as Record<string, unknown>;

  if (typeof source.description !== "string") {
    throw new ArtifactValidationError("Food requires a description");
  }
  if (!Array.isArray(source.items)) {
    throw new ArtifactValidationError("Food requires an array of items");
  }
  const items = source.items.map(parseFoodItem);

  const provided = source.totals as Record<string, unknown> | undefined;
  if (typeof provided !== "object" || provided === null) {
    throw new ArtifactValidationError("Food requires totals");
  }
  for (const key of TOTAL_KEYS) {
    if (!isFiniteNonNegative(provided[key])) {
      throw new ArtifactValidationError(`Food totals.${key} must be a non-negative number`);
    }
  }
  let totals = Object.fromEntries(TOTAL_KEYS.map((key) => [key, round2(provided[key] as number)])) as unknown as FoodTotals;
  if (items.length > 0) {
    const computed = calculateFoodTotals(items);
    for (const key of TOTAL_KEYS) {
      if (totals[key] !== computed[key]) throw new ArtifactValidationError("Food totals do not match its items");
    }
    totals = computed;
  }

  const food: FoodData = { description: source.description, items, totals };

  if (source.quantity !== undefined) {
    if (typeof source.quantity !== "string") throw new ArtifactValidationError("Food quantity must be a text");
    if (source.quantity.trim()) food.quantity = source.quantity.trim();
  }
  if (source.generation !== undefined) {
    const status = (source.generation as { status?: unknown } | null)?.status;
    if (status !== "pending" && status !== "completed" && status !== "failed") {
      throw new ArtifactValidationError("Invalid food generation status");
    }
    if (status === "completed" && !source.recipe) {
      throw new ArtifactValidationError("Completed food generation requires a recipe");
    }
    food.generation = { status };
  }
  if (source.nutritionSource !== undefined) {
    if (source.nutritionSource !== "model-estimate") {
      throw new ArtifactValidationError("Invalid food nutrition source");
    }
    food.nutritionSource = "model-estimate";
  }
  if (source.recipe !== undefined && source.recipe !== null) {
    food.recipe = parseFoodRecipe(source.recipe);
  }

  return food;
}
