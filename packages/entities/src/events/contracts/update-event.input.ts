import type { EventPriority } from "../types/event-priority";
import type { FoodItem } from "../entities/food-event.entity";
import type { SleepEventData } from "../entities/sleep-event.entity";
import type { Workout } from "../entities/training-event.entity";

export interface InterruptionPatchInput {
  id?: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type UpdateEventDataInput =
  | Partial<SleepEventData>
  | { workouts?: Workout[] }
  | { items?: FoodItem[] };

export interface UpdateEventInput {
  eventId: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  interruptions?: InterruptionPatchInput[];
  data?: UpdateEventDataInput;
}
