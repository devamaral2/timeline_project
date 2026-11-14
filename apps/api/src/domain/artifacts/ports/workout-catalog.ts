import type { WorkoutCode } from "../types/training-data";
import type { WorkoutCategory } from "../types/workout-data";

export interface WorkoutDefinition {
  code: WorkoutCode;
  name: string;
  category: WorkoutCategory;
  active: boolean;
}

/** Os exercicios globais, lidos pelo codigo. */
export interface WorkoutCatalog {
  findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]>;
}
