export interface DailyOverviewDto {
  date: string;
  sleep: { id: string; trackedSleepTime: number; score: number; description: string } | null;
  caloriesConsumed: number;
  macros: { protein: number; carbohydrate: number; fat: number };
  micronutrients: Record<string, number>;
  foodEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    finishedAt?: string;
    kcal: number;
    protein: number;
    carbohydrate: number;
    fat: number;
    micronutrients: Record<string, number>;
  }>;
  trainingEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    finishedAt?: string;
    workouts: Array<
      | {
          type: "treadmill" | "running";
          calories: number;
          duration: number;
          pace: number;
          distance: number;
        }
      | {
          type: "weightlifting";
          calories: number;
          duration: number;
          sets: Array<{ exercise: string; repetitions: number; weight: number }>;
        }
      | {
          type: "free";
          calories: number;
          duration: number;
        }
    >;
  }>;
}
