import { ArtifactValidationError } from "../errors/artifact.errors";
import type { WorkoutCode } from "./training-data";

export const WORKOUT_CATEGORIES = ["cardio", "strength", "free"] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];

/** Um exercicio do catalogo. E um artefato global: todos leem, ninguem edita pelo app. */
export interface WorkoutData {
  code: WorkoutCode;
  category: WorkoutCategory;
  active: boolean;
}

export function parseWorkoutData(data: unknown, schemaVersion: number): WorkoutData {
  if (schemaVersion !== 1) throw new ArtifactValidationError("Unsupported schema version");
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Workout data must be an object");
  }
  const { code, category, active } = data as Record<string, unknown>;
  if (typeof code !== "string" || code.length === 0) {
    throw new ArtifactValidationError("Workout requires a code");
  }
  if (!WORKOUT_CATEGORIES.includes(category as WorkoutCategory)) {
    throw new ArtifactValidationError("Workout requires a known category");
  }
  return { code: code as WorkoutCode, category: category as WorkoutCategory, active: active !== false };
}
