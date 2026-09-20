export class MealPromptBuilderService {
  build(inputText: string): string {
    return [
      "Consulte os dados de calorias, micronutrientes e macronutrientes para cada um dos alimentos e responda apenas com JSON valido.",
      "As chaves do JSON devem estar em inglês, mas os valores podem permanecer em português quando necessário.",
      "Retorne um objeto JSON com a chave 'items', contendo um array de alimentos.",
      "Use exatamente esta estrutura por item:",
      JSON.stringify({
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
          magnesiumMg: 27,
          vitaminCMg: 8.7,
          vitaminB6Mg: 0.4,
        },
        otherData: {
          glycemicIndex: 51,
          sodiumMg: 1,
        },
      }),
      "Formato final esperado:",
      JSON.stringify({
        items: ["<use exatamente a estrutura do item acima para cada alimento identificado>"],
      }),
      `Texto do usuario: ${inputText}`,
    ].join("\n\n");
  }
}
