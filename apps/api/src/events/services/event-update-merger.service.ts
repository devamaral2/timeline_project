import { ulid } from "ulid";
import {
  EventItem,
  EventValidationError,
  Interruption,
  calculateMealTotals,
  type Event,
} from "@repo/entities";
import type { WorkoutCatalog } from "@repo/entities/ports";
import type {
  InterruptionPatchInput,
  UpdateEventInput,
  UpdateEventItemInput,
} from "@repo/entities/contracts";

export async function mergeEventUpdate(
  existingEvent: Event,
  input: UpdateEventInput,
  workoutCatalog: WorkoutCatalog,
  now: Date,
): Promise<Event> {
  const items = input.items
    ? await buildUpdatedItems(existingEvent, input.items, workoutCatalog)
    : undefined;

  return existingEvent.revise({
    name: input.name,
    description: input.description,
    startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
    finishedAt: input.finishedAt !== undefined ? new Date(input.finishedAt) : undefined,
    tags: input.tags,
    missed: input.missed,
    priority: input.priority,
    interruptions: mergeInterruptions(existingEvent.interruptions, input.interruptions, now),
    items,
  });
}

async function buildUpdatedItems(
  existingEvent: Event,
  itemsInput: UpdateEventItemInput[],
  workoutCatalog: WorkoutCatalog,
): Promise<EventItem[]> {
  const existingIds = new Set(existingEvent.items.map((item) => item.id));

  const workoutCodes = [
    ...new Set(
      itemsInput
        .filter((item): item is Extract<UpdateEventItemInput, { type: "training" }> => item.type === "training")
        .flatMap((item) => item.data.workouts.map((workout) => workout.workoutCode)),
    ),
  ];
  const workoutDefinitions = workoutCodes.length
    ? await workoutCatalog.findActiveByCodes(workoutCodes)
    : [];
  const workoutNameByCode = new Map(workoutDefinitions.map((definition) => [definition.code, definition.name]));

  return itemsInput.map((itemInput, position) => {
    if (itemInput.id && !existingIds.has(itemInput.id)) {
      throw new EventValidationError(`Event item does not belong to this event: ${itemInput.id}`);
    }
    const id = itemInput.id ?? ulid();

    if (itemInput.type === "meal") {
      return EventItem.create({
        id,
        position,
        type: "meal",
        schemaVersion: itemInput.schemaVersion,
        isPrimary: itemInput.isPrimary,
        data: { ...itemInput.data, totals: calculateMealTotals(itemInput.data.foodItems) },
      });
    }

    if (itemInput.type === "training") {
      const workouts = itemInput.data.workouts.map((workout) => {
        const workoutName = workoutNameByCode.get(workout.workoutCode);
        if (!workoutName) throw new EventValidationError(`Unknown workout code: ${workout.workoutCode}`);
        return { ...workout, workoutName };
      });
      return EventItem.create({
        id,
        position,
        type: "training",
        schemaVersion: itemInput.schemaVersion,
        isPrimary: itemInput.isPrimary,
        data: {
          workouts,
          caloriesBurned: workouts.reduce((total, workout) => total + workout.calories, 0),
        },
      });
    }

    return EventItem.create({
      id,
      position,
      type: itemInput.type,
      schemaVersion: itemInput.schemaVersion,
      isPrimary: itemInput.isPrimary,
      data: itemInput.data,
    });
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
    if (!existing) throw new EventValidationError("Interruption not found on event");
    patchedById.set(patch.id, patchInterruption(existing, patch));
  }

  return [
    ...existingInterruptions.map((interruption) => patchedById.get(interruption.id) ?? interruption),
    ...newInterruptions,
  ];
}

function createNewInterruption(input: InterruptionPatchInput, now: Date): Interruption {
  if (!input.name) throw new EventValidationError("New interruptions require a name");
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
