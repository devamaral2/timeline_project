import type { Food } from "../entities/food.entity";

export interface FoodRepository {
  save(food: Food, actorUserId: string): Promise<void>;
  update(food: Food, actorUserId: string, expectedRevision: number): Promise<void>;
  findVisibleById(id: string, actorUserId: string): Promise<Food | null>;
}
