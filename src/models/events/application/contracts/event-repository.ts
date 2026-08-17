import type { FoodEvent } from "../../domain/entities/food-event.entity";
import type { RoutineEvent } from "../../domain/entities/routine-event.entity";
import type { SleepEvent } from "../../domain/entities/sleep-event.entity";
import type { TrainingEvent } from "../../domain/entities/training-event.entity";
import type { EventType } from "../../domain/types/event-type";

export type DomainEvent = RoutineEvent | FoodEvent | TrainingEvent | SleepEvent;

export interface EventRepository {
  save(event: DomainEvent): Promise<void>;
  update(event: DomainEvent, actorUserId: string): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<DomainEvent | null>;
  findLatestOpenByUserId(userId: string): Promise<DomainEvent | null>;
  listTimeline(params: {
    from?: Date;
    to?: Date;
    type?: EventType;
    tag?: string;
  }): Promise<DomainEvent[]>;
  listByDay(params: { date: string; timeZone: string }): Promise<DomainEvent[]>;
}
