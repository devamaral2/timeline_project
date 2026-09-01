import { getServerEnv } from "../../config/env";
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
    required: ["items"],
    properties: {
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
            "mainMicronutrients",
            "otherData",
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
            mainMicronutrients: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            otherData: {
              type: "object",
              additionalProperties: { type: "number" },
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

    let parsed: { items?: ParsedMealFoodItem[] };
    try {
      parsed = JSON.parse(content) as { items?: ParsedMealFoodItem[] };
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
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}
