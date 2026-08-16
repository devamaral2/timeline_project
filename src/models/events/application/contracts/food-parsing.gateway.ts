import type { FoodItem } from "../../domain/entities/food-event.entity";

export interface FoodParsingGateway {
  parseMeal(input: { text: string }): Promise<{
    items: FoodItem[];
    modelProvider: string;
    modelName: string;
  }>;
}
