import type { MealParsingGateway } from "../gateways/meal-parsing.gateway";

type MealParsingResult = Awaited<ReturnType<MealParsingGateway["parseMeal"]>>;

export class StubMealParsingGateway implements MealParsingGateway {
  constructor(
    private readonly response: MealParsingResult = {
      items: [],
      modelProvider: "stub",
      modelName: "stub-model",
    },
  ) {}

  async parseMeal(): Promise<MealParsingResult> {
    return this.response;
  }
}
