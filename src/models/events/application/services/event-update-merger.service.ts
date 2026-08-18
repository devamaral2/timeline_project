import type { DomainEvent } from "../contracts/event-repository";
import type {
  InterruptionPatchInput,
  UpdateEventInput,
} from "../dtos/update-event.input";
import { FoodEvent, type FoodItem } from "../../domain/entities/food-event.entity";
import { RoutineEvent } from "../../domain/entities/routine-event.entity";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { TrainingEvent, type Workout } from "../../domain/entities/training-event.entity";
import { Interruption } from "../../domain/value-objects/interruption";
import { FoodTotalsService } from "./food-totals.service";

export function mergeEventUpdate(
  existingEvent: DomainEvent,
  input: UpdateEventInput,
  now: Date,
): DomainEvent {
  const sharedProps = {
    id: existingEvent.id,
    userId: existingEvent.userId,
    name: input.name ?? existingEvent.name,
    description: input.description ?? existingEvent.description,
    startedAt: existingEvent.startedAt,
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : existingEvent.finishedAt,
    tags: input.tags ?? existingEvent.tags,
    interruptions: mergeInterruptions(existingEvent.interruptions, input.interruptions, now),
  };

  if (existingEvent instanceof RoutineEvent) {
    return RoutineEvent.create({ ...sharedProps, data: existingEvent.data });
  }

  if (existingEvent instanceof SleepEvent) {
    return SleepEvent.create({
      ...sharedProps,
      data: { ...existingEvent.data, ...(hasSleepData(input.data) ? input.data : {}) },
    });
  }

  if (existingEvent instanceof TrainingEvent) {
    return TrainingEvent.create({
      ...sharedProps,
      data: {
        workouts: hasWorkouts(input.data) ? input.data.workouts : existingEvent.data.workouts,
      },
    });
  }

  const items = hasFoodItems(input.data)
    ? mergeFoodItems(input.data.items, existingEvent.data.items)
    : existingEvent.data.items;
  return FoodEvent.create({
    ...sharedProps,
    data: {
      ...existingEvent.data,
      items,
      totals: new FoodTotalsService().calculate(items),
    },
  });
}

function mergeInterruptions(
  existingInterruptions: Interruption[],
  input: InterruptionPatchInput[] | undefined,
  now: Date,
): Interruption[] {
  if (!input) return existingInterruptions;

  const existingById = new Map(existingInterruptions.map((interruption) => [interruption.id, interruption]));
  const patchedById = new Map<string, Interruption>();
  const newInterruptions: Interruption[] = [];

  for (const patch of input) {
    if (!patch.id) {
      newInterruptions.push(createNewInterruption(patch, now));
      continue;
    }

    const existing = existingById.get(patch.id);
    if (!existing) throw new Error("Interruption not found on event");
    patchedById.set(patch.id, patchInterruption(existing, patch));
  }

  return [
    ...existingInterruptions.map((interruption) => patchedById.get(interruption.id) ?? interruption),
    ...newInterruptions,
  ];
}

function createNewInterruption(input: InterruptionPatchInput, now: Date): Interruption {
  if (!input.name) throw new Error("New interruptions require a name");
  const startedAt = input.startedAt ? new Date(input.startedAt) : now;
  const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date(now.getTime() + 120000);
  return Interruption.create({
    name: input.name,
    description: input.description ?? "",
    startedAt,
    finishedAt,
  });
}

function patchInterruption(existing: Interruption, input: InterruptionPatchInput): Interruption {
  return Interruption.create({
    id: existing.id,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    startedAt: input.startedAt ? new Date(input.startedAt) : existing.startedAt,
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : existing.finishedAt,
  });
}

function mergeFoodItems(inputItems: FoodItem[], existingItems: FoodItem[]): FoodItem[] {
  const existingById = new Map(
    existingItems.filter((item): item is FoodItem & { id: string } => Boolean(item.id)).map((item) => [item.id, item]),
  );

  return inputItems.map((item) => {
    const existingItem = item.id ? existingById.get(item.id) : undefined;
    return existingItem ? { ...item, id: existingItem.id, food: existingItem.food } : item;
  });
}

function hasWorkouts(data: UpdateEventInput["data"]): data is { workouts: Workout[] } {
  return Boolean(data && "workouts" in data && data.workouts);
}

function hasFoodItems(data: UpdateEventInput["data"]): data is { items: FoodItem[] } {
  return Boolean(data && "items" in data && data.items);
}

function hasSleepData(
  data: UpdateEventInput["data"],
): data is { score?: number; trackedSleepTime?: number } {
  return Boolean(data && ("score" in data || "trackedSleepTime" in data));
}
