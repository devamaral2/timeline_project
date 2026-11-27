import { ulid } from "ulid";
import {
  Artifact,
  ArtifactValidationError,
  EMPTY_FOOD_TOTALS,
  calculateFoodTotals,
  type WorkoutCode,
  type WorkoutInput,
  type WorkoutSnapshot,
} from "../../../domain";
import type { WorkoutCatalog } from "../../../domain/ports";
import type { ArtifactDataInput, CreateArtifactInput } from "@repo/contracts";
import { getMealTaskName } from "../../tasks/services/meal-task-name.service";

export const ARTIFACT_TIME_ZONE = "America/Sao_Paulo";

/** O que um `type` + `data` de edicao vira depois de recalcular o que e derivado. */
export interface ResolvedArtifactData {
  type: string;
  data: unknown;
}

/** Uma entrada de edicao que traz o conteudo inteiro do artefato. */
export type ArtifactContentInput = ArtifactDataInput & { name?: string; tags?: string[]; schemaVersion?: number };

/**
 * Monta artefatos a partir do que o cliente ou o agente manda: o alimento fica
 * pendente, a espera do pedido de construcao que calcula os nutrientes; o
 * treino passa pelos exercicios globais; e os totais derivados sao recalculados
 * aqui. O `data` guardado nunca confia no que veio de fora.
 */
export class ArtifactBuilder {
  constructor(private readonly workoutCatalog: WorkoutCatalog) {}

  /** Um artefato novo a partir de `CreateArtifactInput`. `at` da o nome do alimento ("Almoco"). */
  async fromCreateInput(input: CreateArtifactInput, userId: string, at: Date): Promise<Artifact> {
    const common = { userId, name: input.name, tags: input.tags };

    switch (input.type) {
      case undefined:
      case "text":
        return Artifact.create({ ...common, type: "text", data: input.data });

      // Os outros tipos de texto livre guardam o mesmo dado; o tipo e o que veio.
      case "news":
      case "email_summary":
      case "youtube_transcript":
        return Artifact.create({ ...common, type: input.type, data: input.data });

      case "food": {
        const description = input.data.inputText.trim();
        if (!description) throw new ArtifactValidationError("Food description cannot be empty");
        return Artifact.create({
          ...common,
          name: input.name ?? getMealTaskName(at, ARTIFACT_TIME_ZONE),
          type: "food",
          data: {
            description,
            items: [],
            totals: { ...EMPTY_FOOD_TOTALS },
            generation: { status: "pending" },
          },
        });
      }

      case "sleep":
        return Artifact.create({
          ...common,
          type: "sleep",
          data: {
            trackedSleepTime: input.data?.trackedSleepTime ?? 0,
            score: input.data?.score ?? 0,
          },
        });

      case "training": {
        const workouts = await this.buildWorkouts(input.data?.workouts ?? []);
        return Artifact.create({
          ...common,
          type: "training",
          data: { workouts, caloriesBurned: sumCalories(workouts) },
        });
      }
    }
  }

  /**
   * O `data` completo de uma edicao, com o que e derivado recalculado: os
   * totais do alimento, o nome dos treinos e as calorias queimadas.
   */
  async resolveUpdateData(input: ArtifactDataInput): Promise<ResolvedArtifactData> {
    if (input.type === "food") {
      if (input.data.generation?.status === "pending") {
        throw new ArtifactValidationError("Only food creation can schedule the nutrient calculation");
      }
      const items = input.data.items ?? [];
      return {
        type: "food",
        data: { ...input.data, items, totals: items.length > 0 ? calculateFoodTotals(items) : input.data.totals },
      };
    }

    if (input.type === "training") {
      const names = await this.workoutNames(input.data.workouts.map((workout) => workout.workoutCode));
      const workouts = input.data.workouts.map((workout) => {
        const workoutName = names.get(workout.workoutCode);
        if (!workoutName) throw new ArtifactValidationError(`Unknown workout code: ${workout.workoutCode}`);
        return { ...workout, workoutName };
      });
      return { type: "training", data: { workouts, caloriesBurned: sumCalories(workouts) } };
    }

    return { type: input.type, data: input.data };
  }

  /** Um artefato novo a partir de uma entrada de edicao sem `id`: o `data` ja vem completo. */
  async fromUpdateInput(input: ArtifactContentInput, userId: string): Promise<Artifact> {
    const { type, data } = await this.resolveUpdateData(input);
    if (input.type === "food" && (input.data.generation || input.data.nutritionSource)) {
      throw new ArtifactValidationError("Food generation metadata is server-owned");
    }
    return Artifact.create({
      userId,
      type,
      schemaVersion: input.schemaVersion,
      name: input.name,
      tags: input.tags,
      data,
    });
  }

  private async workoutNames(codes: readonly WorkoutCode[]): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return new Map();
    const definitions = await this.workoutCatalog.findActiveByCodes(unique);
    return new Map(definitions.map((definition) => [definition.code, definition.name]));
  }

  private async buildWorkouts(inputs: readonly WorkoutInput[]): Promise<WorkoutSnapshot[]> {
    if (inputs.length === 0) return [];

    const nameByCode = await this.workoutNames(inputs.map((workout) => workout.workoutCode));

    return inputs.map((workout) => {
      const workoutName = nameByCode.get(workout.workoutCode);
      if (!workoutName) throw new ArtifactValidationError(`Unknown workout code: ${workout.workoutCode}`);

      const base = {
        id: workout.id ?? ulid(),
        workoutName,
        calories: workout.calories ?? 0,
        duration: workout.duration,
      };

      if (workout.workoutCode === "weightlifting") {
        return {
          ...base,
          workoutCode: "weightlifting",
          sets: workout.sets.map((set) => ({
            id: set.id ?? ulid(),
            exercise: set.exercise,
            repetitions: set.repetitions,
            weight: set.weight,
          })),
        } as WorkoutSnapshot;
      }

      if (workout.workoutCode === "free") {
        return { ...base, workoutCode: "free" } as WorkoutSnapshot;
      }

      return { ...base, workoutCode: workout.workoutCode, pace: workout.pace, distance: workout.distance } as WorkoutSnapshot;
    });
  }
}

function sumCalories(workouts: readonly { calories: number }[]): number {
  return workouts.reduce((total, workout) => total + workout.calories, 0);
}
