import type { Event } from "../entities/event.entity";

/**
 * Porta final do agregado, estruturalmente igual a EventAggregateRepository.
 * A Task 13 remove a porta temporaria e deixa uma unica definicao.
 */
export type DomainEvent = Event;

export interface EventRepository {
  save(event: Event): Promise<void>;
  saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  findLatestOpenByUserId(userId: string): Promise<Event | null>;
}
