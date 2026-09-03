import { ulid } from "ulid";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { MealParsingGateway } from "../gateways/meal-parsing.gateway";
import type { EventRepository, WorkoutCatalog } from "@repo/entities/ports";
import type { CreateEventInput, CreateEventItemInput } from "@repo/entities/contracts";
import { Event, EventItem, EventValidationError } from "@repo/entities";
import type { WorkoutCode, WorkoutInput, WorkoutSnapshot } from "@repo/entities";
import { MealTotalsService } from "../services/meal-totals.service";
import { getMealEventName } from "../services/meal-event-name.service";
import type { ResolvedEventSchedule } from "../services/event-schedule.service";

export const EVENT_TIME_ZONE = "America/Sao_Paulo";

export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly mealParsingGateway: MealParsingGateway,
    private readonly workoutCatalog: WorkoutCatalog,
    private readonly mealTotalsService: MealTotalsService = new MealTotalsService(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: CreateEventInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedEventSchedule,
  ): Promise<{ eventId: string }> {
    const startedAt = schedule?.startedAt ?? this.clock();
    const items = await this.buildItems(input.items, startedAt);
    const primary = items.find((item) => item.isPrimary);
    const name = input.name ?? this.deriveName(primary);

    const event = Event.create({
      userId: actor.userId,
      name,
      description: input.description ?? "",
      startedAt,
      finishedAt: schedule?.finishedAt,
      tags: input.tags ?? [],
      interruptions: [],
      items,
      missed: input.missed,
      priority: input.priority,
    });

    // O evento anterior termina quando este comeca -- que nem sempre e "agora", desde que o
    // agente de voz pode registrar algo que comecou no passado.
    await this.eventRepository.saveClosingLatestOpen(event, event.startedAt);
    return { eventId: event.id };
  }

  private async buildItems(itemsInput: CreateEventItemInput[], startedAt: Date): Promise<EventItem[]> {
    const singleItem = itemsInput.length === 1;
    return Promise.all(
      itemsInput.map((itemInput, position) => this.buildItem(itemInput, position, singleItem, startedAt)),
    );
  }

  private async buildItem(
    itemInput: CreateEventItemInput,
    position: number,
    singleItem: boolean,
    startedAt: Date,
  ): Promise<EventItem> {
    const isPrimary = singleItem ? true : Boolean(itemInput.isPrimary);

    switch (itemInput.type) {
      case "routine":
        return EventItem.create({ position, type: "routine", schemaVersion: 1, isPrimary, data: {} });

      case "meal": {
        const parsed = await this.mealParsingGateway.parseMeal({ text: itemInput.data.inputText });
        const foodItems = this.mealTotalsService.toFoodItems(parsed.items);
        const totals = this.mealTotalsService.calculate(foodItems);
        return EventItem.create({
          position,
          type: "meal",
          schemaVersion: 1,
          isPrimary,
          data: {
            name: getMealEventName(startedAt, EVENT_TIME_ZONE),
            description: itemInput.data.inputText,
            foodItems,
            totals,
          },
        });
      }

      case "sleep":
        return EventItem.create({
          position,
          type: "sleep",
          schemaVersion: 1,
          isPrimary,
          data: {
            trackedSleepTime: itemInput.data?.trackedSleepTime ?? 0,
            score: itemInput.data?.score ?? 0,
          },
        });

      case "training": {
        const workouts = await this.buildWorkouts(itemInput.data?.workouts ?? []);
        return EventItem.create({
          position,
          type: "training",
          schemaVersion: 1,
          isPrimary,
          data: {
            workouts,
            caloriesBurned: workouts.reduce((total, workout) => total + workout.calories, 0),
          },
        });
      }
    }
  }

  private async buildWorkouts(inputs: readonly WorkoutInput[]): Promise<WorkoutSnapshot[]> {
    if (inputs.length === 0) return [];

    const codes = [...new Set(inputs.map((workout) => workout.workoutCode))] as WorkoutCode[];
    const definitions = await this.workoutCatalog.findActiveByCodes(codes);
    const nameByCode = new Map(definitions.map((definition) => [definition.code, definition.name]));

    return inputs.map((workout) => {
      const workoutName = nameByCode.get(workout.workoutCode);
      if (!workoutName) throw new EventValidationError(`Unknown workout code: ${workout.workoutCode}`);

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

  private deriveName(primary: EventItem | undefined): string {
    switch (primary?.type) {
      case "sleep":
        return "Sono";
      case "training":
        return "Treino";
      case "meal":
        return (primary.data as { name: string }).name;
      default:
        throw new EventValidationError("Event requires a name");
    }
  }
}
