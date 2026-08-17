import type { SleepEventData } from "../../domain/entities/sleep-event.entity";
import type { Workout } from "../../domain/entities/training-event.entity";

export interface CreateBaseEventInput {
  description?: string;
  tags?: string[];
}

export type CreateEventInput =
  | ({ type: "routine"; name: string } & CreateBaseEventInput)
  | ({ type: "sleep"; data?: Partial<SleepEventData> } & CreateBaseEventInput)
  | ({ type: "training"; data?: { workouts?: Workout[] } } & CreateBaseEventInput)
  | ({ type: "food"; inputText: string } & CreateBaseEventInput);

export type NonFoodCreateEventInput = Exclude<CreateEventInput, { type: "food" }>;
