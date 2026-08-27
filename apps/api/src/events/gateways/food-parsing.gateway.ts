import type { FoodItem } from "@repo/entities";

export interface FoodParsingGateway {
  parseMeal(input: { text: string }): Promise<{
    items: FoodItem[];
    modelProvider: string;
    modelName: string;
  }>;
}
