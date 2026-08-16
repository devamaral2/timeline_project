import type { RoutineEventData } from "../../domain/entities/routine-event.entity";
import type { SleepEventData } from "../../domain/entities/sleep-event.entity";
import type { TrainingEventData } from "../../domain/entities/training-event.entity";
import type { InterruptionProps } from "../../domain/value-objects/interruption";

export interface BaseEventInput {
  eventId?: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  interruptions: InterruptionProps[];
}

export type NonFoodCreateEventInput =
  | ({ type: "routine"; data?: RoutineEventData } & BaseEventInput)
  | ({ type: "training"; data: TrainingEventData } & BaseEventInput)
  | ({ type: "sleep"; data: SleepEventData } & BaseEventInput);

export type CreateEventInput =
  | NonFoodCreateEventInput
  | ({ type: "food"; inputText: string } & BaseEventInput);
