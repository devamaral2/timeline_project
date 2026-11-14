import type { WorkoutSnapshot } from "../artifacts/types/training-data";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** O resumo de um dia civil: sono, o que foi comido e os treinos. */
export interface DailyOverviewDto {
  date: string;
  sleep: { id: string; trackedSleepTime: number; score: number; description: string } | null;
  caloriesConsumed: number;
  macros: { protein: number; carbohydrate: number; fat: number };
  mealEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    estimatedFinishAt?: string;
    kcal: number;
    protein: number;
    carbohydrate: number;
    fat: number;
  }>;
  trainingEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    estimatedFinishAt?: string;
    workouts: Array<DistributiveOmit<WorkoutSnapshot, "id">>;
  }>;
}
