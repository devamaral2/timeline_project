import type { CreateEventInput } from "@repo/entities/contracts";
import type { EventProps } from "@repo/entities";
import type { FoodEventData } from "@repo/entities";
import type { RoutineEventData } from "@repo/entities";
import type { SleepEventData } from "@repo/entities";
import type { TrainingEventData } from "@repo/entities";
import type { Interruption } from "@repo/entities";
import { ulid } from "ulid";
import { getFoodEventName } from "./food-event-name.service";
import type { ResolvedEventSchedule } from "./event-schedule.service";

export const EVENT_TIME_ZONE = "America/Sao_Paulo";

type NormalizedEventProps<TData> = Omit<EventProps<TData>, "id" | "userId" | "finishedAt"> & {
  finishedAt: Date | undefined;
};

export type NormalizedCreateEvent =
  | ({ type: "routine" } & NormalizedEventProps<RoutineEventData>)
  | ({ type: "sleep" } & NormalizedEventProps<SleepEventData>)
  | ({ type: "training" } & NormalizedEventProps<TrainingEventData>)
  | ({ type: "food"; inputText: string } & NormalizedEventProps<Omit<FoodEventData, "items" | "totals" | "modelProvider" | "modelName" | "parsedAt">>);

export function normalizeCreateEventInput(
  input: CreateEventInput,
  now: Date,
  schedule?: ResolvedEventSchedule,
): NormalizedCreateEvent {
  // A janela so chega preenchida pelo fluxo de voz; os formularios continuam sem poder envia-la.
  const startedAt = schedule?.startedAt ?? now;
  const common = {
    description: input.description ?? "",
    startedAt,
    finishedAt: schedule?.finishedAt,
    tags: input.tags ?? [],
    missed: input.missed,
    priority: input.priority,
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
    case "training": {
      const workouts = normalizeWorkouts(input.data?.workouts ?? []);
      return {
        type: "training",
        name: "Treino",
        data: {
          workouts,
          caloriesBurned: workouts.reduce((total, workout) => total + workout.calories, 0),
        },
        ...common,
      };
    }
    case "food":
      return {
        type: "food",
        name: getFoodEventName(startedAt, EVENT_TIME_ZONE),
        inputText: input.inputText,
        data: { inputText: input.inputText },
        ...common,
      };
  }
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
