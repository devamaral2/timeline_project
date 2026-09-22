import type { Event } from "../entities/event.entity";

export type DomainEvent = Event;

/**
 * O evento nao tem mais "o anterior fecha quando este comeca": cada evento e
 * gravado por si, com o inicio e o fim que o usuario disse -- no passado, agora
 * ou no futuro. Um evento sem `finishedAt` e um evento sem fim declarado, e nao
 * "o que esta acontecendo agora".
 */
export interface EventRepository {
  save(event: Event): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
}
