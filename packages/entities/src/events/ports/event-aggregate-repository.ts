import type { Event } from "../entities/event.entity";

/**
 * Porta nova usada durante a fase de expansao (Task 3 a 9). Convive com
 * event-repository.ts (Firestore) ate o corte adotar este contrato como o
 * EventRepository final e remover a porta legada.
 */
export interface EventAggregateRepository {
  save(event: Event): Promise<void>;
  saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  findLatestOpenByUserId(userId: string): Promise<Event | null>;
}
