import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DailyOverviewQuery, DailyOverviewQueryParams } from "@repo/entities/ports";
import type { DailyOverviewDto } from "@repo/entities/contracts";
import type {
  EventItemFoodItem as FoodItem,
  EventItemTrainingData as TrainingData,
} from "@repo/entities";
import type { MealItem } from "@repo/entities";
import * as schema from "../../database/schema";

interface DayEventRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  started_at: Date;
  finished_at: Date | null;
}

interface DayItemRow extends Record<string, unknown> {
  event_id: string;
  type: string;
  data: unknown;
}

export class PostgresDailyOverviewQuery implements DailyOverviewQuery {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto> {
    const dayStart = new Date(`${params.date}T00:00:00-03:00`);

    const idsResult = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM events
      WHERE user_id = ${params.userId} AND started_on = ${params.date}::date
      UNION ALL
      SELECT id FROM events
      WHERE user_id = ${params.userId}
        AND started_at < ${dayStart}
        AND finished_at >= ${dayStart}
    `);
    const eventIds = [...new Set(idsResult.rows.map((row) => row.id))];

    if (eventIds.length === 0) {
      return {
        date: params.date,
        sleep: null,
        caloriesConsumed: 0,
        macros: { protein: 0, carbohydrate: 0, fat: 0 },
        micronutrients: {},
        mealEvents: [],
        trainingEvents: [],
      };
    }

    const [eventsResult, itemsResult] = await Promise.all([
      this.db.execute<DayEventRow>(sql`
        SELECT id, name, description, started_at, finished_at
        FROM events
        WHERE id IN ${eventIds}
      `),
      this.db.execute<DayItemRow>(sql`
        SELECT event_id, type, data
        FROM event_items
        WHERE event_id IN ${eventIds} AND type IN ('meal', 'sleep', 'training')
        ORDER BY event_id, position
      `),
    ]);

    const eventsById = new Map(eventsResult.rows.map((row) => [row.id, row]));
    const micronutrients: Record<string, number> = {};
    const mealEvents: DailyOverviewDto["mealEvents"] = [];
    const trainingEvents: DailyOverviewDto["trainingEvents"] = [];
    let latestSleep: { event: DayEventRow; data: { trackedSleepTime: number; score: number } } | undefined;

    for (const item of itemsResult.rows) {
      const event = eventsById.get(item.event_id);
      if (!event) continue;

      if (item.type === "meal") {
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
          startedAt: new Date(event.started_at).toISOString(),
          finishedAt: event.finished_at ? new Date(event.finished_at).toISOString() : undefined,
          kcal: data.totals.totalCaloriesKcal,
          protein: data.totals.totalProteinGrams,
          carbohydrate: data.totals.totalCarbohydrateGrams,
          fat: data.totals.totalFatGrams,
          micronutrients: mealMicronutrients,
        });
      } else if (item.type === "sleep") {
        const data = item.data as { trackedSleepTime: number; score: number };
        if (!latestSleep || new Date(event.started_at) > new Date(latestSleep.event.started_at)) {
          latestSleep = { event, data };
        }
      } else if (item.type === "training") {
        const data = item.data as TrainingData;
        trainingEvents.push({
          id: event.id,
          name: event.name,
          description: event.description,
          startedAt: new Date(event.started_at).toISOString(),
          finishedAt: event.finished_at ? new Date(event.finished_at).toISOString() : undefined,
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
