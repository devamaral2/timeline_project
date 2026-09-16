import { EventNotFoundError, EventOwnershipError, EventRevisionConflictError, type Event } from "@repo/entities";
import type { EventRepository } from "@repo/entities/ports";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

export class InMemoryEventRepository implements EventRepository {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async save(event: Event): Promise<void> {
    this.database.events.push(event);
  }

  async update(event: Event, actorUserId: string, expectedRevision: number): Promise<void> {
    const index = this.database.events.findIndex((storedEvent) => storedEvent.id === event.id);
    if (index === -1) throw new EventNotFoundError(`Event not found: ${event.id}`);

    const existing = this.database.events[index];
    if (existing.userId !== actorUserId) throw new EventOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new EventRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }

    this.database.events[index] = event;
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    const event = this.database.events.find((storedEvent) => storedEvent.id === eventId);
    if (!event) throw new EventNotFoundError(`Event not found: ${eventId}`);
    if (event.userId !== actorUserId) throw new EventOwnershipError();
    this.database.events = this.database.events.filter((storedEvent) => storedEvent.id !== eventId);
  }

  async findById(eventId: string): Promise<Event | null> {
    return this.database.events.find((event) => event.id === eventId) ?? null;
  }
}
