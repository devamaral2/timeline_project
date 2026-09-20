export interface DailyOverviewDto {
  date: string;
  sleep: { id: string; trackedSleepTime: number; score: number; description: string } | null;
  caloriesConsumed: number;
  macros: { protein: number; carbohydrate: number; fat: number };
  micronutrients: Record<string, number>;
  mealEvents: Array<{
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
          workoutCode: "treadmill" | "running";
          workoutName: string;
          calories: number;
          duration: number;
          pace: number;
          distance: number;
        }
      | {
          workoutCode: "weightlifting";
          workoutName: string;
          calories: number;
          duration: number;
          sets: Array<{ exercise: string; repetitions: number; weight: number }>;
        }
      | {
          workoutCode: "free";
          workoutName: string;
          calories: number;
          duration: number;
        }
    >;
  }>;
}
