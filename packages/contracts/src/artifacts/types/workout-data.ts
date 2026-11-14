import type { WorkoutCode } from "./training-data";

/** Um exercicio do catalogo. E um artefato global: todos leem, ninguem edita pelo app. */
export interface WorkoutData {
  code: WorkoutCode;
  category: "cardio" | "strength" | "free";
  active: boolean;
}
