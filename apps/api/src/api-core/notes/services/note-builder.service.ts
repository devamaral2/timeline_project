import { ulid } from "ulid";
import {
  EventValidationError,
  Note,
  NoteValidationError,
  calculateMealTotals,
  type WorkoutCode,
  type WorkoutInput,
  type WorkoutSnapshot,
} from "../../../domain";
import type { WorkoutCatalog } from "../../../domain/ports";
import type { CreateNoteInput, UpdateEventNoteInput } from "@repo/contracts";
import type { MealParsingGateway } from "../../events/gateways/meal-parsing.gateway";
import { getMealEventName } from "../../events/services/meal-event-name.service";
import { MealTotalsService } from "../../events/services/meal-totals.service";

export const NOTE_TIME_ZONE = "America/Sao_Paulo";

/** O que um `type` + `data` de edicao vira depois de recalcular o que e derivado. */
export interface ResolvedNoteData {
  type: string;
  data: unknown;
}

/**
 * Monta notes a partir do que o cliente ou o agente manda: a refeicao passa
 * pelo modelo, o treino pelo catalogo, e os totais derivados sao recalculados
 * aqui — o `data` guardado nunca confia no que veio de fora.
 */
export class NoteBuilder {
  constructor(
    private readonly mealParsingGateway: MealParsingGateway,
    private readonly workoutCatalog: WorkoutCatalog,
    private readonly mealTotalsService: MealTotalsService = new MealTotalsService(),
  ) {}

  /** Uma note nova a partir de `CreateNoteInput`. `startedAt` da o nome da refeicao ("Almoco"). */
  async fromCreateInput(input: CreateNoteInput, userId: string, startedAt: Date): Promise<Note> {
    const common = { userId, name: input.name, tags: input.tags };

    switch (input.type) {
      case undefined:
      case "text":
        return Note.create({ ...common, type: "text", data: input.data });

      case "meal": {
        const parsed = await this.mealParsingGateway.parseMeal({ text: input.data.inputText });
        const foodItems = this.mealTotalsService.toFoodItems(parsed.items);
        return Note.create({
          ...common,
          type: "meal",
          data: {
            name: getMealEventName(startedAt, NOTE_TIME_ZONE),
            description: input.data.inputText,
            foodItems,
            totals: this.mealTotalsService.calculate(foodItems),
            ...(parsed.recipe ? { recipe: parsed.recipe } : {}),
          },
        });
      }

      case "sleep":
        return Note.create({
          ...common,
          type: "sleep",
          data: {
            trackedSleepTime: input.data?.trackedSleepTime ?? 0,
            score: input.data?.score ?? 0,
          },
        });

      case "training": {
        const workouts = await this.buildWorkouts(input.data?.workouts ?? []);
        return Note.create({
          ...common,
          type: "training",
          data: { workouts, caloriesBurned: sumCalories(workouts) },
        });
      }
    }
  }

  /**
   * O `data` completo de uma edicao, com o que e derivado recalculado: os
   * totais da refeicao, o nome dos treinos e as calorias queimadas.
   */
  async resolveUpdateData(
    input: Extract<UpdateEventNoteInput, { data: unknown }>,
  ): Promise<ResolvedNoteData> {
    if (input.type === "meal") {
      return {
        type: "meal",
        data: { ...input.data, totals: calculateMealTotals(input.data.foodItems) },
      };
    }

    if (input.type === "training") {
      const names = await this.workoutNames(input.data.workouts.map((workout) => workout.workoutCode));
      const workouts = input.data.workouts.map((workout) => {
        const workoutName = names.get(workout.workoutCode);
        if (!workoutName) throw new EventValidationError(`Unknown workout code: ${workout.workoutCode}`);
        return { ...workout, workoutName };
      });
      return { type: "training", data: { workouts, caloriesBurned: sumCalories(workouts) } };
    }

    return { type: input.type, data: input.data };
  }

  /** Uma note nova a partir de uma entrada de edicao sem `id`: o `data` ja vem completo. */
  async fromUpdateInput(
    input: Extract<UpdateEventNoteInput, { data: unknown }>,
    userId: string,
  ): Promise<Note> {
    const { type, data } = await this.resolveUpdateData(input);
    return Note.create({
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
      if (!workoutName) throw new NoteValidationError(`Unknown workout code: ${workout.workoutCode}`);

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
