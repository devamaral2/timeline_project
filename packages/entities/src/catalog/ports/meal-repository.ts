import type { Meal } from "../entities/meal.entity";

export interface MealRepository {
  save(meal: Meal, actorUserId: string): Promise<void>;
  update(meal: Meal, actorUserId: string, expectedRevision: number): Promise<void>;
  findVisibleById(id: string, actorUserId: string): Promise<Meal | null>;
}
