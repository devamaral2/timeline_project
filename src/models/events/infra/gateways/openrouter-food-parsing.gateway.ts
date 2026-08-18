import { getServerEnv } from "@/config/env";
import type { FoodParsingGateway } from "../../application/contracts/food-parsing.gateway";
import { FoodPromptBuilderService } from "../../application/services/food-prompt-builder.service";
import type { FoodItem } from "../../domain/entities/food-event.entity";

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

export class OpenRouterFoodParsingGateway implements FoodParsingGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly promptBuilder: FoodPromptBuilderService = new FoodPromptBuilderService(),
  ) {}

  async parseMeal(input: { text: string }): Promise<{
    items: FoodItem[];
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
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter response did not include meal JSON");
    }

    const parsed = JSON.parse(content) as { items?: FoodItem[] };
    const items = parsed.items;
    if (!Array.isArray(items)) {
      throw new Error(`OpenRouter response shape is invalid: ${content}`);
    }

    return {
      items,
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}
