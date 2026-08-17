import type { CreateEventInput } from "../dtos/create-event.input";
import type { EventProps } from "../../domain/entities/event.entity";
import type { FoodEventData } from "../../domain/entities/food-event.entity";
import type { RoutineEventData } from "../../domain/entities/routine-event.entity";
import type { SleepEventData } from "../../domain/entities/sleep-event.entity";
import type { TrainingEventData } from "../../domain/entities/training-event.entity";
import type { Interruption } from "../../domain/value-objects/interruption";
import { ulid } from "ulid";

type NormalizedEventProps<TData> = Omit<EventProps<TData>, "id" | "userId" | "finishedAt"> & {
  finishedAt: undefined;
};

export type NormalizedCreateEvent =
  | ({ type: "routine" } & NormalizedEventProps<RoutineEventData>)
  | ({ type: "sleep" } & NormalizedEventProps<SleepEventData>)
  | ({ type: "training" } & NormalizedEventProps<TrainingEventData>)
  | ({ type: "food"; inputText: string } & NormalizedEventProps<Omit<FoodEventData, "items" | "totals" | "modelProvider" | "modelName" | "parsedAt">>);

export function normalizeCreateEventInput(input: CreateEventInput, now: Date): NormalizedCreateEvent {
  const common = {
    description: input.description ?? "",
    startedAt: now,
    finishedAt: undefined,
    tags: input.tags ?? [],
    interruptions: [] as Interruption[],
  };

  switch (input.type) {
    case "routine":
      return { type: "routine", name: input.name, data: {}, ...common };
    case "sleep":
      return {
        type: "sleep",
        name: "Sono",
        data: { trackedSleepTime: input.data?.trackedSleepTime ?? 0, score: input.data?.score ?? 0 },
        ...common,
      };
    case "training":
      return {
        type: "training",
        name: "Treino",
        data: { workouts: normalizeWorkouts(input.data?.workouts ?? []) },
        ...common,
      };
    case "food":
      return {
        type: "food",
        name: getFoodEventName(now),
        inputText: input.inputText,
        data: { inputText: input.inputText },
        ...common,
      };
  }
}

function getFoodEventName(now: Date): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes <= 180 || minutes >= 1081) return "Jantar";
  if (minutes <= 390) return "Desjejum";
  if (minutes <= 600) return "Café da manhã";
  if (minutes <= 690) return "Colação";
  if (minutes <= 959) return "Almoço";
  return "Lanche da tarde";
}

function normalizeWorkouts(workouts: TrainingEventData["workouts"]): TrainingEventData["workouts"] {
  return workouts.map((workout) => {
    const normalizedWorkout = { ...workout, id: workout.id ?? ulid() };
    if (normalizedWorkout.type !== "weightlifting") return normalizedWorkout;

    return {
      ...normalizedWorkout,
      sets: normalizedWorkout.sets.map((set) => ({ ...set, id: set.id ?? ulid() })),
    };
  });
}
