import type { DailyOverviewDto } from "../dtos/daily-overview.dto";
import type { EventRepository } from "../contracts/event-repository";
import type { FoodEvent } from "../../domain/entities/food-event.entity";
import type { SleepEvent } from "../../domain/entities/sleep-event.entity";
import type { TrainingEvent } from "../../domain/entities/training-event.entity";

export class GetDailyOverviewUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { date: string; timeZone?: string }): Promise<DailyOverviewDto> {
    const timeZone = input.timeZone ?? "America/Sao_Paulo";
    const events = await this.eventRepository.listByDay({
      date: input.date,
      timeZone,
    });

    return buildDailyOverview(
      input.date,
      events.filter((event): event is SleepEvent => event.type === "sleep"),
      events.filter(
        (event): event is FoodEvent =>
          event.type === "food" && dateInTimeZone(event.startedAt, timeZone) === input.date,
      ),
      events.filter(
        (event): event is TrainingEvent =>
          event.type === "training" && dateInTimeZone(event.startedAt, timeZone) === input.date,
      ),
    );
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

function buildDailyOverview(
  date: string,
  sleepEvents: SleepEvent[],
  foodEvents: FoodEvent[],
  trainingEvents: TrainingEvent[],
): DailyOverviewDto {
  const mostRecentSleep = [...sleepEvents].sort(
    (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
  )[0];
  const micronutrients: Record<string, number> = {};

  const foodCards = foodEvents.map((event) => {
    for (const [name, amount] of Object.entries(event.data.totals.totalMicronutrients)) {
      micronutrients[name] = (micronutrients[name] ?? 0) + amount;
    }
    return {
      id: event.id,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt.toISOString(),
      finishedAt: event.finishedAt?.toISOString(),
      kcal: event.data.totals.totalCaloriesKcal,
      protein: event.data.totals.totalProteinGrams,
      carbohydrate: event.data.totals.totalCarbohydrateGrams,
      fat: event.data.totals.totalFatGrams,
      micronutrients: event.data.totals.totalMicronutrients,
    };
  });

  return {
    date,
    sleep: mostRecentSleep
      ? {
          id: mostRecentSleep.id,
          trackedSleepTime: mostRecentSleep.data.trackedSleepTime,
          score: mostRecentSleep.data.score,
          description: mostRecentSleep.description,
        }
      : null,
    caloriesConsumed: foodCards.reduce((total, event) => total + event.kcal, 0),
    caloriesBurned: trainingEvents.reduce((total, event) => total + event.data.caloriesBurned, 0),
    macros: {
      protein: foodCards.reduce((total, event) => total + event.protein, 0),
      carbohydrate: foodCards.reduce((total, event) => total + event.carbohydrate, 0),
      fat: foodCards.reduce((total, event) => total + event.fat, 0),
    },
    micronutrients,
    foodEvents: foodCards,
    trainingEvents: trainingEvents.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt.toISOString(),
      finishedAt: event.finishedAt?.toISOString(),
      kcal: event.data.caloriesBurned,
    })),
  };
}
