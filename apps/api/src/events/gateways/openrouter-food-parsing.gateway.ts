import { getServerEnv } from "../../config/env";
import type { FoodParsingGateway } from "./food-parsing.gateway";
import { FoodPromptBuilderService } from "../services/food-prompt-builder.service";
import type { FoodItem } from "@repo/entities";

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
    console.log("[OpenRouterFoodParsingGateway] parseMeal called", {
      hasApiKey: Boolean(this.apiKey),
      apiKeyPrefix: this.apiKey ? `${this.apiKey.slice(0, 10)}...` : undefined,
      apiKeyLength: this.apiKey?.length,
      modelName: this.modelName,
      inputTextLength: input.text.length,
    });

    if (!this.apiKey) {
      console.error("[OpenRouterFoodParsingGateway] OPENROUTER_API_KEY is missing");
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    if (!this.modelName) {
      console.error("[OpenRouterFoodParsingGateway] OPENROUTER_MODEL is missing");
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

    console.log("[OpenRouterFoodParsingGateway] sending request to OpenRouter", {
      model: requestBody.model,
    });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[OpenRouterFoodParsingGateway] received response", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<failed to read body>");
      console.error("[OpenRouterFoodParsingGateway] OpenRouter request failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      console.error(
        "[OpenRouterFoodParsingGateway] response did not include meal JSON",
        { payload },
      );
      throw new Error("OpenRouter response did not include meal JSON");
    }

    let parsed: { items?: FoodItem[] };
    try {
      parsed = JSON.parse(content) as { items?: FoodItem[] };
    } catch (parseError) {
      console.error("[OpenRouterFoodParsingGateway] failed to JSON.parse content", {
        content,
        parseError,
      });
      throw parseError;
    }
    const items = parsed.items;
    if (!Array.isArray(items)) {
      console.error("[OpenRouterFoodParsingGateway] response shape is invalid", { content });
      throw new Error(`OpenRouter response shape is invalid: ${content}`);
    }

    console.log("[OpenRouterFoodParsingGateway] parseMeal succeeded", {
      itemCount: items.length,
    });

    return {
      items,
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}
