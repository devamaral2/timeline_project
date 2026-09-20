import { ulid } from "ulid";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import type { MealParsingGateway } from "../gateways/meal-parsing.gateway";
import type { EventRepository, WorkoutCatalog } from "../../../domain/ports";
import type { CreateEventInput, CreateEventItemInput } from "@repo/contracts";
import { Event, EventItem, EventValidationError } from "../../../domain";
import type { WorkoutCode, WorkoutInput, WorkoutSnapshot } from "../../../domain";
import { MealTotalsService } from "../services/meal-totals.service";
import { getMealEventName } from "../services/meal-event-name.service";
import type { ResolvedEventSchedule } from "../services/event-schedule.service";

export const EVENT_TIME_ZONE = "America/Sao_Paulo";

/**
 * O controller ja recusa uma data invalida; aqui so traduzimos o que veio. Nao
 * ha limite de quao longe no passado ou no futuro o evento pode cair.
 */
function parseInstant(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new EventValidationError("Invalid date");
  return instant;
}

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
    const event = await this.prepare(input, actor, schedule);
    await this.eventRepository.save(event);
    return { eventId: event.id };
  }

  /**
   * Monta o evento sem gravar. A serie usa isto para validar o template e
   * resolver uma vez so o que custa caro — a refeicao passa pelo modelo aqui,
   * e nao a cada ocorrencia gerada.
   */
  async prepare(
    input: CreateEventInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedEventSchedule,
  ): Promise<Event> {
    const startedAt = schedule?.startedAt ?? parseInstant(input.startedAt) ?? this.clock();
    const finishedAt = schedule?.finishedAt ?? parseInstant(input.finishedAt);
    const items = await this.buildItems(input.items, startedAt);
    const primary = items.find((item) => item.isPrimary);
    const name = input.name ?? this.deriveName(primary);

    return Event.create({
      userId: actor.userId,
      name,
      description: input.description ?? "",
      startedAt,
      finishedAt,
      tags: input.tags ?? [],
      interruptions: [],
      items,
      missed: input.missed,
      priority: input.priority,
      notifyOffsetsMinutes: input.notifyOffsetsMinutes,
    });
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
