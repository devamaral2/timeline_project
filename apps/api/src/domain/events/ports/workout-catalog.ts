import type { WorkoutCode } from "../../notes/types/training-data";

export interface WorkoutDefinition {
  code: WorkoutCode;
  name: string;
  category: "cardio" | "strength" | "free";
  active: boolean;
}

export interface WorkoutCatalog {
  findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]>;
}
