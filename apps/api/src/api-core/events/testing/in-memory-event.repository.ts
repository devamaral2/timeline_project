import type { EventRepository } from "../../../domain/ports";
import {
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  type ArtifactWrites,
  type Event,
} from "../../../domain";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

export class InMemoryEventRepository implements EventRepository {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async save(event: Event, artifacts?: ArtifactWrites): Promise<void> {
    this.database.writeArtifacts(artifacts);
    this.database.events.push(event);
  }

  async update(event: Event, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void> {
    const index = this.database.events.findIndex((storedEvent) => storedEvent.id === event.id);
    if (index === -1) throw new EventNotFoundError(`Event not found: ${event.id}`);

    const existing = this.database.events[index] as Event;
    if (existing.userId !== actorUserId) throw new EventOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new EventRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }

    this.database.writeArtifacts(artifacts);
    this.database.events[index] = event;
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    const event = this.database.events.find((storedEvent) => storedEvent.id === eventId);
    if (!event) throw new EventNotFoundError(`Event not found: ${eventId}`);
    if (event.userId !== actorUserId) throw new EventOwnershipError();
    this.database.events = this.database.events.filter((storedEvent) => storedEvent.id !== eventId);
  }

  async findById(eventId: string): Promise<Event | null> {
    const event = this.database.events.find((stored) => stored.id === eventId);
    return event ? this.database.hydrate(event) : null;
  }

  async findByIds(eventIds: readonly string[]): Promise<Event[]> {
    return this.database.events.filter((event) => eventIds.includes(event.id)).map((event) => this.database.hydrate(event));
  }
}
