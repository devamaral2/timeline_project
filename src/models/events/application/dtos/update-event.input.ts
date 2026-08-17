import type { FoodItem } from "../../domain/entities/food-event.entity";
import type { SleepEventData } from "../../domain/entities/sleep-event.entity";
import type { Workout } from "../../domain/entities/training-event.entity";

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
  finishedAt?: string;
  tags?: string[];
  interruptions?: InterruptionPatchInput[];
  data?: UpdateEventDataInput;
}
