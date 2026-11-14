import { sql } from "drizzle-orm";
import type { DailyOverviewDto } from "@repo/contracts";
import { MAX_EVENT_BLOCK_DAYS, type FoodData, type SleepData, type TrainingData } from "../../../../domain";
import type { DailyOverviewQuery, DailyOverviewQueryParams } from "../../../../domain/ports";
import type { Db } from "../../shared/tx";

interface DayEventRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  started_at: Date;
  estimated_finish_at: Date | null;
}

interface DayArtifactRow extends Record<string, unknown> {
  event_id: string;
  type: string;
  data: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(value: Date | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export class PostgresDailyOverviewQuery implements DailyOverviewQuery {
  constructor(private readonly db: Db) {}

  async get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto> {
    // Sao Paulo nao tem horario de verao desde 2019: o dia civil e sempre UTC-3.
    const dayStart = new Date(`${params.date}T00:00:00-03:00`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    // Os eventos de pessoa da agenda que tocam o dia: comecam nele, ou comecaram antes e ainda nao terminaram.
    const eventsResult = await this.db.execute<DayEventRow>(sql`
      SELECT e.id, e.name, e.description, e.started_at, e.estimated_finish_at
      FROM events e
      WHERE e.user_id = ${params.userId}
        AND e.started_at IS NOT NULL AND NOT e.long_running AND e.kind <> 'step' AND e.deleted_at IS NULL
        AND e.actor = 'human'
        AND e.started_at < ${dayEnd}
        AND e.started_at >= ${dayStart}::timestamptz - ${`${MAX_EVENT_BLOCK_DAYS} days`}::interval
        AND coalesce(e.estimated_finish_at, e.finished_at, e.started_at) >= ${dayStart}
    `);
    const eventsById = new Map(eventsResult.rows.map((row) => [row.id, row]));
    const empty: DailyOverviewDto = {
      date: params.date,
      sleep: null,
      caloriesConsumed: 0,
      macros: { protein: 0, carbohydrate: 0, fat: 0 },
      mealEvents: [],
      trainingEvents: [],
    };
    if (eventsById.size === 0) return empty;

    const artifactsResult = await this.db.execute<DayArtifactRow>(sql`
      SELECT r.event_id, a.type, a.data
      FROM event_artifact_relation r
      JOIN artifacts a ON a.id = r.artifact_id
      WHERE r.event_id IN ${[...eventsById.keys()]}
        AND r.relation <> 'deletes'
        AND a.deleted_at IS NULL
        AND a.type IN ('food', 'sleep', 'training')
      ORDER BY r.event_id, r.position
    `);

    // Um evento pode usar varios alimentos: as calorias dele sao a soma.
    const meals = new Map<string, DailyOverviewDto["mealEvents"][number]>();
    const trainingEvents: DailyOverviewDto["trainingEvents"] = [];
    let latestSleep: { event: DayEventRow; data: SleepData } | undefined;

    for (const item of artifactsResult.rows) {
      const event = eventsById.get(item.event_id);
      if (!event) continue;
      const base = {
        id: event.id,
        name: event.name,
        description: event.description,
        startedAt: new Date(event.started_at).toISOString(),
        estimatedFinishAt: iso(event.estimated_finish_at),
      };

      if (item.type === "food") {
        const { totals } = item.data as FoodData;
        const meal = meals.get(event.id) ?? { ...base, kcal: 0, protein: 0, carbohydrate: 0, fat: 0 };
        meal.kcal += totals.totalCaloriesKcal;
        meal.protein += totals.totalProteinGrams;
        meal.carbohydrate += totals.totalCarbohydrateGrams;
        meal.fat += totals.totalFatGrams;
        meals.set(event.id, meal);
      } else if (item.type === "sleep") {
        if (!latestSleep || new Date(event.started_at) > new Date(latestSleep.event.started_at)) {
          latestSleep = { event, data: item.data as SleepData };
        }
      } else if (item.type === "training") {
        const data = item.data as TrainingData;
        trainingEvents.push({
          ...base,
          workouts: data.workouts.map(({ id: _id, ...workout }) => workout),
        });
      }
    }

    const mealEvents = [...meals.values()];
    return {
      ...empty,
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
      mealEvents,
      trainingEvents,
    };
  }
}
