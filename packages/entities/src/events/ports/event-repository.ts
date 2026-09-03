import type { Event } from "../entities/event.entity";

export type DomainEvent = Event;

export interface EventRepository {
  save(event: Event): Promise<void>;
  saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  findLatestOpenByUserId(userId: string): Promise<Event | null>;
}
