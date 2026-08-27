import type { FoodEvent } from "../entities/food-event.entity";
import type { RoutineEvent } from "../entities/routine-event.entity";
import type { SleepEvent } from "../entities/sleep-event.entity";
import type { TrainingEvent } from "../entities/training-event.entity";
import type { EventType } from "../types/event-type";

export type DomainEvent = RoutineEvent | FoodEvent | TrainingEvent | SleepEvent;

export interface EventRepository {
  save(event: DomainEvent): Promise<void>;
  saveClosingLatestOpen(event: DomainEvent, finishedAt: Date): Promise<void>;
  update(event: DomainEvent, actorUserId: string): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<DomainEvent | null>;
  findLatestOpenByUserId(userId: string): Promise<DomainEvent | null>;
  listTimeline(params: {
    userId: string;
    from?: Date;
    to?: Date;
    type?: EventType;
    tag?: string;
  }): Promise<DomainEvent[]>;
  listByDay(params: { date: string; timeZone: string }): Promise<DomainEvent[]>;
}
