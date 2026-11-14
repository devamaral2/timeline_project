import type { DailyOverviewDto } from "@repo/contracts";
import { MAX_EVENT_BLOCK_DAYS, type Event, type FoodData, type SleepData, type TrainingData } from "../../../domain";
import type { DailyOverviewQuery, DailyOverviewQueryParams } from "../../../domain/ports";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

const DAY_MS = 24 * 60 * 60 * 1000;

/** O resumo do dia sobre o banco em memoria, com a mesma semantica de `PostgresDailyOverviewQuery`. */
export class InMemoryDailyOverviewQuery implements DailyOverviewQuery {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto> {
    // Sao Paulo nao tem horario de verao desde 2019: o dia civil e sempre UTC-3.
    const dayStart = new Date(`${params.date}T00:00:00-03:00`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    // Os eventos de pessoa da agenda que tocam o dia: comecam nele, ou comecaram antes e ainda nao terminaram.
    const events = this.database.events
      .filter((event) => {
        const startedAt = event.startedAt;
        if (event.userId !== params.userId || !startedAt || event.longRunning || event.kind === "step") return false;
        if (event.actor !== "human") return false;
        if (startedAt >= dayEnd) return false;
        if (startedAt.getTime() < dayStart.getTime() - MAX_EVENT_BLOCK_DAYS * DAY_MS) return false;
        return (event.estimatedFinishAt ?? event.finishedAt ?? startedAt) >= dayStart;
      })
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

    // Um evento pode usar varios alimentos: as calorias dele sao a soma.
    const mealEvents: DailyOverviewDto["mealEvents"] = [];
    const trainingEvents: DailyOverviewDto["trainingEvents"] = [];
    let latestSleep: { event: Event; data: SleepData } | undefined;

    for (const event of events) {
      const startedAt = event.startedAt as Date;
      const base = {
        id: event.id,
        name: event.name,
        description: event.description,
        startedAt: startedAt.toISOString(),
        estimatedFinishAt: event.estimatedFinishAt?.toISOString(),
      };
      let meal: DailyOverviewDto["mealEvents"][number] | undefined;

      for (const link of event.artifactLinks) {
        if (link.relation === "deletes") continue;
        const artifact = this.database.artifacts.find((candidate) => candidate.id === link.artifactId);
        if (!artifact) continue;

        if (artifact.type === "food") {
          const { totals } = artifact.data as FoodData;
          meal ??= { ...base, kcal: 0, protein: 0, carbohydrate: 0, fat: 0 };
          meal.kcal += totals.totalCaloriesKcal;
          meal.protein += totals.totalProteinGrams;
          meal.carbohydrate += totals.totalCarbohydrateGrams;
          meal.fat += totals.totalFatGrams;
        } else if (artifact.type === "sleep") {
          if (!latestSleep || startedAt > (latestSleep.event.startedAt as Date)) {
            latestSleep = { event, data: artifact.data as SleepData };
          }
        } else if (artifact.type === "training") {
          const data = artifact.data as TrainingData;
          trainingEvents.push({ ...base, workouts: data.workouts.map(({ id: _id, ...workout }) => workout) });
        }
      }
      if (meal) mealEvents.push(meal);
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
      mealEvents,
      trainingEvents,
    };
  }
}
