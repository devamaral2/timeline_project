import { afterEach, expect, test, vi } from "vitest";
import { OpenRouterMealParsingGateway, toMealRecipe } from "./openrouter-meal-parsing.gateway";

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
                },
              ],
              recipe: {
                source: "model",
                servings: null,
                prepTimeMinutes: 2,
                ingredients: [{ name: "Banana prata", quantity: "1 unidade" }],
                steps: ["Descasque e coma."],
              },
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
    recipe: {
      source: "model",
      prepTimeMinutes: 2,
      ingredients: [{ name: "Banana prata", quantity: "1 unidade" }],
      steps: ["Descasque e coma."],
    },
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
  // Sem micronutrientes no pedido ao modelo; a receita e obrigatoria no schema.
  const schema = request.response_format.json_schema?.schema as {
    required: string[];
    properties: { items: { items: { properties: object } } };
  };
  expect(schema.required).toEqual(["items", "recipe"]);
  expect(Object.keys(schema.properties.items.items.properties)).not.toContain("mainMicronutrients");
  expect(request).not.toHaveProperty("tools");
  expect(request).not.toHaveProperty("plugins");
});

test.each([
  { items: [], recipe: undefined },
  { items: [], recipe: { source: "model", ingredients: [], steps: [] } },
  {
    items: [{ food: "Banana", portion: "1", approximateWeightGrams: 100, caloriesKcal: -1, macronutrients: {} }],
    recipe: { source: "model", ingredients: [], steps: ["Sirva."] },
  },
])("rejects invalid nutrition or absent/unusable recipe instead of persisting partial generation", async (generated) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(generated) } }] }),
  }));
  const gateway = new OpenRouterMealParsingGateway("test-key", "test-model");
  await expect(gateway.parseMeal({ text: "banana" })).rejects.toThrow();
});

test("toMealRecipe descarta receita sem passos e normaliza o que sobra", () => {
  expect(toMealRecipe(undefined)).toBeUndefined();
  expect(toMealRecipe({ source: "user", ingredients: [], steps: ["  ", ""] })).toBeUndefined();

  expect(
    toMealRecipe({
      source: "user",
      servings: 0,
      prepTimeMinutes: 15,
      ingredients: [
        { name: " Ovo ", quantity: "2" },
        { name: "Sal", quantity: "  " },
        { name: "  ", quantity: "1" },
      ],
      steps: [" Bata os ovos. ", "", "Frite."],
    }),
  ).toEqual({
    source: "user",
    prepTimeMinutes: 15,
    ingredients: [
      { name: "Ovo", quantity: "2" },
      { name: "Sal", quantity: "a gosto" },
    ],
    steps: ["Bata os ovos.", "Frite."],
  });

  // Origem desconhecida nunca vira "user": so o que o modelo marcou explicitamente.
  expect(toMealRecipe({ source: "alguma", ingredients: [], steps: ["Sirva."] })?.source).toBe("model");
});
