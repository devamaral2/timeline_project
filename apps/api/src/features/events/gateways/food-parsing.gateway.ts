import type { FoodItem } from "../../../domain";

export interface FoodParsingGateway {
  parseMeal(input: { text: string }): Promise<{
    items: FoodItem[];
    modelProvider: string;
    modelName: string;
  }>;
}
