import type { NoteWrites } from "../../notes/types/note-writes";
import type { Event } from "../entities/event.entity";

export type DomainEvent = Event;

/**
 * O evento nao tem mais "o anterior fecha quando este comeca": cada evento e
 * gravado por si, com o inicio e o fim que o usuario disse -- no passado, agora
 * ou no futuro. Um evento sem `finishedAt` e um evento sem fim declarado, e nao
 * "o que esta acontecendo agora".
 */
export interface EventRepository {
  /** `notes`: as notes que nascem com o evento, gravadas antes e na mesma transacao dele. */
  save(event: Event, notes?: NoteWrites): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number, notes?: NoteWrites): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
}
