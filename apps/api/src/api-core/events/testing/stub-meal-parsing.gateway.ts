import type { MealParsingGateway, ParsedMealFoodItem } from "../gateways/meal-parsing.gateway";

export class StubMealParsingGateway implements MealParsingGateway {
  constructor(
    private readonly response: {
      items: ParsedMealFoodItem[];
      modelProvider: string;
      modelName: string;
    } = {
      items: [],
      modelProvider: "stub",
      modelName: "stub-model",
    },
  ) {}

  async parseMeal(): Promise<{ items: ParsedMealFoodItem[]; modelProvider: string; modelName: string }> {
    return this.response;
  }
}
