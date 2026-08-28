import type { EventPriority } from "../types/event-priority";
import type { FoodItem } from "../entities/food-event.entity";
import type { SleepEventData } from "../entities/sleep-event.entity";
import type { Workout } from "../entities/training-event.entity";

export interface EventDetailInterruptionDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt: string;
}

interface EventDetailCommonDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  /** A anotacao de nao realizado — e esta que o formulario de edicao altera. */
  missed: boolean;
  priority: EventPriority;
  interruptions: EventDetailInterruptionDto[];
}

export type EventDetailDto =
  | ({ type: "routine" } & EventDetailCommonDto)
  | ({ type: "sleep"; data: SleepEventData } & EventDetailCommonDto)
  | ({ type: "training"; data: { workouts: Workout[] } } & EventDetailCommonDto)
  | ({ type: "food"; data: { items: FoodItem[] } } & EventDetailCommonDto);
