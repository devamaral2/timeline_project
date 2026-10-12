import { getServerEnv } from "../../../config/env";
import type { MealRecipe } from "../../../domain";
import type { MealParsingGateway, ParsedMealFoodItem } from "./meal-parsing.gateway";
import { MealPromptBuilderService } from "../services/meal-prompt-builder.service";

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const mealItemsSchema = {
  name: "meal_items",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items", "recipe"],
    properties: {
      recipe: {
        type: "object",
        additionalProperties: false,
        required: ["source", "servings", "prepTimeMinutes", "ingredients", "steps"],
        properties: {
          source: { type: "string", enum: ["user", "model"] },
          servings: { type: ["number", "null"] },
          prepTimeMinutes: { type: ["number", "null"] },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "quantity"],
              properties: {
                name: { type: "string" },
                quantity: { type: "string" },
              },
            },
          },
          steps: { type: "array", items: { type: "string" } },
        },
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "food",
            "portion",
            "approximateWeightGrams",
            "caloriesKcal",
            "macronutrients",
          ],
          properties: {
            food: { type: "string" },
            portion: { type: "string" },
            approximateWeightGrams: { type: "number" },
            caloriesKcal: { type: "number" },
            macronutrients: {
              type: "object",
              additionalProperties: false,
              required: [
                "carbohydratesGrams",
                "proteinsGrams",
                "totalFatGrams",
                "fiberGrams",
              ],
              properties: {
                carbohydratesGrams: { type: "number" },
                proteinsGrams: { type: "number" },
                totalFatGrams: { type: "number" },
                fiberGrams: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export class OpenRouterMealParsingGateway implements MealParsingGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly promptBuilder: MealPromptBuilderService = new MealPromptBuilderService(),
  ) {}

  async parseMeal(input: { text: string }): Promise<{
    items: ParsedMealFoodItem[];
    recipe?: MealRecipe;
    modelProvider: string;
    modelName: string;
  }> {
    if (!this.apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    if (!this.modelName) {
      throw new Error("Missing OPENROUTER_MODEL");
    }

    const requestBody = {
      model: this.modelName,
      messages: [
        {
          role: "user",
          content: this.promptBuilder.build(input.text),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: mealItemsSchema,
      },
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<failed to read body>");
      console.error("[OpenRouterMealParsingGateway] OpenRouter request failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[OpenRouterMealParsingGateway] response did not include meal JSON", { payload });
      throw new Error("OpenRouter response did not include meal JSON");
    }

    let parsed: { items?: ParsedMealFoodItem[]; recipe?: unknown };
    try {
      parsed = JSON.parse(content) as { items?: ParsedMealFoodItem[]; recipe?: unknown };
    } catch (parseError) {
      console.error("[OpenRouterMealParsingGateway] failed to JSON.parse content", { content, parseError });
      throw parseError;
    }
    const items = parsed.items;
    if (!Array.isArray(items)) {
      console.error("[OpenRouterMealParsingGateway] response shape is invalid", { content });
      throw new Error(`OpenRouter response shape is invalid: ${content}`);
    }

    return {
      items,
      recipe: toMealRecipe(parsed.recipe),
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}

const MAX_RECIPE_STEPS = 30;
const MAX_RECIPE_INGREDIENTS = 40;

/**
 * Traduz a receita do modelo para o dominio. Nunca lanca: uma receita sem
 * passos ou mal formada some, e a refeicao (que e o que o usuario pediu) segue
 * sem ela. Texto vazio e itens duplicados saem aqui, nao no parser do dominio.
 */
export function toMealRecipe(raw: unknown): MealRecipe | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;

  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const steps = (Array.isArray(source.steps) ? source.steps : [])
    .map(text)
    .filter(Boolean)
    .slice(0, MAX_RECIPE_STEPS);
  if (steps.length === 0) return undefined;

  const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
    .flatMap((entry) => {
      const ingredient = (entry ?? {}) as Record<string, unknown>;
      const name = text(ingredient.name);
      return name ? [{ name, quantity: text(ingredient.quantity) || "a gosto" }] : [];
    })
    .slice(0, MAX_RECIPE_INGREDIENTS);

  const positive = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

  const recipe: MealRecipe = {
    source: source.source === "user" ? "user" : "model",
    ingredients,
    steps,
  };
  const servings = positive(source.servings);
  if (servings !== undefined) recipe.servings = servings;
  const prepTimeMinutes = positive(source.prepTimeMinutes);
  if (prepTimeMinutes !== undefined) recipe.prepTimeMinutes = prepTimeMinutes;
  return recipe;
}
