import type { FoodParsingGateway } from "../../contracts/food-parsing.gateway";
import type { FoodItem } from "../../../domain/entities/food-event.entity";

export class StubFoodParsingGateway implements FoodParsingGateway {
  constructor(
    private readonly response: { items: FoodItem[]; modelProvider: string; modelName: string } = {
      items: [],
      modelProvider: "stub",
      modelName: "stub-model",
    },
  ) {}

  async parseMeal(): Promise<{ items: FoodItem[]; modelProvider: string; modelName: string }> {
    return this.response;
  }
}
