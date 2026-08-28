import type { EventPriority } from "../types/event-priority";
import type { SleepEventData } from "../entities/sleep-event.entity";
import type { Workout } from "../entities/training-event.entity";

export interface CreateBaseEventInput {
  description?: string;
  tags?: string[];
  /** Anotacao do usuario: um evento so nasce marcado se alguem disser isso. */
  missed?: boolean;
  priority?: EventPriority;
}

export type CreateEventInput =
  | ({ type: "routine"; name: string } & CreateBaseEventInput)
  | ({ type: "sleep"; data?: Partial<SleepEventData> } & CreateBaseEventInput)
  | ({ type: "training"; data?: { workouts?: Workout[] } } & CreateBaseEventInput)
  | ({ type: "food"; inputText: string } & CreateBaseEventInput);

export type NonFoodCreateEventInput = Exclude<CreateEventInput, { type: "food" }>;
