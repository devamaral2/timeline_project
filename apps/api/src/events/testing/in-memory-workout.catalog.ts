import type { WorkoutCatalog, WorkoutDefinition } from "@repo/entities/ports";
import type { WorkoutCode } from "@repo/entities";

const DEFAULT_DEFINITIONS: WorkoutDefinition[] = [
  { code: "treadmill", name: "Esteira", category: "cardio", active: true },
  { code: "running", name: "Corrida", category: "cardio", active: true },
  { code: "weightlifting", name: "Musculação", category: "strength", active: true },
  { code: "free", name: "Livre", category: "free", active: true },
];

export class InMemoryWorkoutCatalog implements WorkoutCatalog {
  constructor(private readonly definitions: WorkoutDefinition[] = DEFAULT_DEFINITIONS) {}

  async findActiveByCodes(codes: readonly WorkoutCode[]): Promise<WorkoutDefinition[]> {
    return codes
      .map((code) => this.definitions.find((definition) => definition.code === code && definition.active))
      .filter((definition): definition is WorkoutDefinition => Boolean(definition));
  }
}
