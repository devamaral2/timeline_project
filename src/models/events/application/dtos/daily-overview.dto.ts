export interface DailyOverviewDto {
  date: string;
  sleep: { id: string; trackedSleepTime: number; score: number; description: string } | null;
  caloriesConsumed: number;
  caloriesBurned: number;
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
    kcal: number;
  }>;
}
