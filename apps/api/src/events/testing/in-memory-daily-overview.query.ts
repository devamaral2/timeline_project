import type { DailyOverviewQuery, DailyOverviewQueryParams } from "@repo/entities/ports";
import type { DailyOverviewDto } from "@repo/entities/contracts";
import type { Event, FoodItem, MealItem, TrainingData } from "@repo/entities";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

export class InMemoryDailyOverviewQuery implements DailyOverviewQuery {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto> {
    const events = this.database.events.filter((event) => {
      if (event.userId !== params.userId) return false;
      const startedDate = dateInTimeZone(event.startedAt, params.timeZone);
      const finishedDate = dateInTimeZone(event.finishedAt ?? event.startedAt, params.timeZone);
      return startedDate <= params.date && finishedDate >= params.date;
    });

    const micronutrients: Record<string, number> = {};
    const mealEvents: DailyOverviewDto["mealEvents"] = [];
    const trainingEvents: DailyOverviewDto["trainingEvents"] = [];
    let latestSleep: { event: Event; data: { trackedSleepTime: number; score: number } } | undefined;

    for (const event of events) {
      for (const item of event.items) {
        if (item.type === "sleep") {
          const data = item.data as { trackedSleepTime: number; score: number };
          if (!latestSleep || event.startedAt > latestSleep.event.startedAt) {
            latestSleep = { event, data };
          }
          continue;
        }

        if (item.type === "meal" && dateInTimeZone(event.startedAt, params.timeZone) === params.date) {
          const data = item.data as MealItem;
          const mealMicronutrients: Record<string, number> = {};
          for (const foodItem of data.foodItems as FoodItem[]) {
            for (const [name, amount] of Object.entries(foodItem.micronutrients)) {
              micronutrients[name] = (micronutrients[name] ?? 0) + amount;
              mealMicronutrients[name] = (mealMicronutrients[name] ?? 0) + amount;
            }
          }
          mealEvents.push({
            id: event.id,
            name: event.name,
            description: event.description,
            startedAt: event.startedAt.toISOString(),
            finishedAt: event.finishedAt?.toISOString(),
            kcal: data.totals.totalCaloriesKcal,
            protein: data.totals.totalProteinGrams,
            carbohydrate: data.totals.totalCarbohydrateGrams,
            fat: data.totals.totalFatGrams,
            micronutrients: mealMicronutrients,
          });
          continue;
        }

        if (item.type === "training" && dateInTimeZone(event.startedAt, params.timeZone) === params.date) {
          const data = item.data as TrainingData;
          trainingEvents.push({
            id: event.id,
            name: event.name,
            description: event.description,
            startedAt: event.startedAt.toISOString(),
            finishedAt: event.finishedAt?.toISOString(),
            workouts: data.workouts.map((workout) =>
              workout.workoutCode === "weightlifting"
                ? {
                    workoutCode: "weightlifting",
                    workoutName: workout.workoutName,
                    calories: workout.calories,
                    duration: workout.duration,
                    sets: workout.sets.map((set) => ({
                      exercise: set.exercise,
                      repetitions: set.repetitions,
                      weight: set.weight,
                    })),
                  }
                : workout.workoutCode === "free"
                  ? {
                      workoutCode: "free",
                      workoutName: workout.workoutName,
                      calories: workout.calories,
                      duration: workout.duration,
                    }
                  : {
                      workoutCode: workout.workoutCode,
                      workoutName: workout.workoutName,
                      calories: workout.calories,
                      duration: workout.duration,
                      pace: workout.pace,
                      distance: workout.distance,
                    },
            ),
          });
        }
      }
    }

    return {
      date: params.date,
      sleep: latestSleep
        ? {
            id: latestSleep.event.id,
            trackedSleepTime: latestSleep.data.trackedSleepTime,
            score: latestSleep.data.score,
            description: latestSleep.event.description,
          }
        : null,
      caloriesConsumed: mealEvents.reduce((total, event) => total + event.kcal, 0),
      macros: {
        protein: mealEvents.reduce((total, event) => total + event.protein, 0),
        carbohydrate: mealEvents.reduce((total, event) => total + event.carbohydrate, 0),
        fat: mealEvents.reduce((total, event) => total + event.fat, 0),
      },
      micronutrients,
      mealEvents,
      trainingEvents,
    };
  }
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
