import type { FoodItem } from "../../domain/entities/food-event.entity";
import type { SleepEventData } from "../../domain/entities/sleep-event.entity";
import type { Workout } from "../../domain/entities/training-event.entity";

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
  interruptions: EventDetailInterruptionDto[];
}

export type EventDetailDto =
  | ({ type: "routine" } & EventDetailCommonDto)
  | ({ type: "sleep"; data: SleepEventData } & EventDetailCommonDto)
  | ({ type: "training"; data: { workouts: Workout[] } } & EventDetailCommonDto)
  | ({ type: "food"; data: { items: FoodItem[] } } & EventDetailCommonDto);
