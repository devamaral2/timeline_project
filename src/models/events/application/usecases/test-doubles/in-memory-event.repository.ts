import type { DomainEvent, EventRepository } from "../../contracts/event-repository";
import { FoodEvent } from "../../../domain/entities/food-event.entity";
import { RoutineEvent } from "../../../domain/entities/routine-event.entity";
import { SleepEvent } from "../../../domain/entities/sleep-event.entity";
import { TrainingEvent } from "../../../domain/entities/training-event.entity";

export class InMemoryEventRepository implements EventRepository {
  private events: DomainEvent[];

  constructor(events: DomainEvent[] = []) {
    this.events = [...events];
  }

  async save(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  async saveClosingLatestOpen(event: DomainEvent, finishedAt: Date): Promise<void> {
    const previousOpenEvent = await this.findLatestOpenByUserId(event.userId);
    if (previousOpenEvent) {
      const index = this.events.findIndex((storedEvent) => storedEvent.id === previousOpenEvent.id);
      this.events[index] = recreateWithFinishedAt(previousOpenEvent, finishedAt);
    }
    this.events.push(event);
  }

  async update(event: DomainEvent, actorUserId: string): Promise<void> {
    const index = this.events.findIndex((storedEvent) => storedEvent.id === event.id);
    if (index === -1) return;
    this.assertOwner(this.events[index].userId, actorUserId);
    this.events[index] = event;
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    const event = this.events.find((storedEvent) => storedEvent.id === eventId);
    if (!event) return;
    this.assertOwner(event.userId, actorUserId);
    this.events = this.events.filter((storedEvent) => storedEvent.id !== eventId);
  }

  async findById(eventId: string): Promise<DomainEvent | null> {
    return this.events.find((event) => event.id === eventId) ?? null;
  }

  async findLatestOpenByUserId(userId: string): Promise<DomainEvent | null> {
    return (
      this.events
        .filter((event) => event.userId === userId && !event.finishedAt)
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0] ?? null
    );
  }

  async listTimeline(params: Parameters<EventRepository["listTimeline"]>[0]): Promise<DomainEvent[]> {
    return this.events.filter((event) => {
      if (event.userId !== params.userId) return false;
      if (params.from && event.startedAt < params.from) return false;
      if (params.to && event.startedAt > params.to) return false;
      if (params.type && event.type !== params.type) return false;
      if (params.tag && !event.tags.includes(params.tag)) return false;
      return true;
    });
  }

  async listByDay(params: Parameters<EventRepository["listByDay"]>[0]): Promise<DomainEvent[]> {
    return this.events.filter((event) => {
      const startedDate = dateInTimeZone(event.startedAt, params.timeZone);
      const finishedDate = dateInTimeZone(event.finishedAt ?? event.startedAt, params.timeZone);
      return startedDate <= params.date && finishedDate >= params.date;
    });
  }

  private assertOwner(ownerUserId: string, actorUserId: string): void {
    if (ownerUserId !== actorUserId) throw new Error("Only the event owner can modify it");
  }
}

function recreateWithFinishedAt(event: DomainEvent, finishedAt: Date): DomainEvent {
  if (event instanceof RoutineEvent) return RoutineEvent.create({ ...event, finishedAt });
  if (event instanceof TrainingEvent) return TrainingEvent.create({ ...event, finishedAt });
  if (event instanceof SleepEvent) return SleepEvent.create({ ...event, finishedAt });
  return FoodEvent.create({ ...event, finishedAt });
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
