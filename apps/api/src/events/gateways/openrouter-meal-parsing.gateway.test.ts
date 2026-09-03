import { afterEach, expect, test, vi } from "vitest";
import { OpenRouterMealParsingGateway } from "./openrouter-meal-parsing.gateway";

afterEach(() => {
  vi.restoreAllMocks();
});

test("requests structured JSON schema and parses a wrapped items response", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  food: "Banana prata",
                  portion: "1 unidade media",
                  approximateWeightGrams: 100,
                  caloriesKcal: 89,
                  macronutrients: {
                    carbohydratesGrams: 22.8,
                    proteinsGrams: 1.1,
                    totalFatGrams: 0.3,
                    fiberGrams: 2.6,
                  },
                  mainMicronutrients: {
                    potassiumMg: 358,
                  },
                  otherData: {
                    sodiumMg: 1,
                  },
                },
              ],
            }),
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const gateway = new OpenRouterMealParsingGateway("test-api-key", "openai/gpt-oss-20b:free", {
    build: () => "meal prompt",
  });

  const result = await gateway.parseMeal({ text: "banana" });

  expect(result).toEqual({
    items: [
      expect.objectContaining({
        food: "Banana prata",
        caloriesKcal: 89,
      }),
    ],
    modelProvider: "openrouter",
    modelName: "openai/gpt-oss-20b:free",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "https://openrouter.ai/api/v1/chat/completions",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-api-key",
      }),
      body: expect.any(String),
    }),
  );

  const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
    response_format: { type: string; json_schema?: { name: string; strict: boolean; schema: object } };
  };
  expect(request.response_format).toEqual(
    expect.objectContaining({
      type: "json_schema",
      json_schema: expect.objectContaining({
        name: "meal_items",
        strict: true,
      }),
    }),
  );
});
