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

/** `user`: o preparo foi dito pelo usuario; `model`: foi proposto pelo modelo (a tela mostra "Sugerido"). */
export type FoodRecipeSource = "user" | "model";

export interface FoodRecipeIngredient {
  name: string;
  /** Texto livre: "300 g", "1 colher de sopa", "a gosto". */
  quantity: string;
}

export interface FoodRecipe {
  source: FoodRecipeSource;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: FoodRecipeIngredient[];
  /** Modo de preparo, um passo por item. */
  steps: string[];
}

/**
 * Um alimento: calorias e receita. Nao se distingue alimento de refeicao; o
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
  /** Preenchido pelo servidor enquanto o agente calcula os nutrientes. */
  generation?: { status: "pending" | "completed" | "failed" };
  nutritionSource?: "model-estimate";
}
