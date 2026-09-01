import type { FoodEvent } from "../entities/food-event.entity";
import type { RoutineEvent } from "../entities/routine-event.entity";
import type { SleepEvent } from "../entities/sleep-event.entity";
import type { TrainingEvent } from "../entities/training-event.entity";
import type { EventType } from "../types/event-type";

/**
 * Porta antiga isolada durante o corte (Task 9 a 12) e removida na contracao
 * final. O repositorio Firestore continua implementando-a; EventRepository
 * final passa a expor o contrato do agregado novo.
 */
export type LegacyDomainEvent = RoutineEvent | FoodEvent | TrainingEvent | SleepEvent;

export interface LegacyEventRepository {
  save(event: LegacyDomainEvent): Promise<void>;
  saveClosingLatestOpen(event: LegacyDomainEvent, finishedAt: Date): Promise<void>;
  update(event: LegacyDomainEvent, actorUserId: string): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<LegacyDomainEvent | null>;
  findLatestOpenByUserId(userId: string): Promise<LegacyDomainEvent | null>;
  listTimeline(params: {
    userId: string;
    from?: Date;
    to?: Date;
    type?: EventType;
    tag?: string;
  }): Promise<LegacyDomainEvent[]>;
  listByDay(params: { date: string; timeZone: string }): Promise<LegacyDomainEvent[]>;
}
