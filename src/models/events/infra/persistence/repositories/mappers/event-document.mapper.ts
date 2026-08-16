import type { DomainEvent } from "../../../../application/contracts/event-repository";
import { FoodEvent, type FoodEventData } from "../../../../domain/entities/food-event.entity";
import { RoutineEvent, type RoutineEventData } from "../../../../domain/entities/routine-event.entity";
import { SleepEvent, type SleepEventData } from "../../../../domain/entities/sleep-event.entity";
import { TrainingEvent, type TrainingEventData } from "../../../../domain/entities/training-event.entity";
import type { EventType } from "../../../../domain/types/event-type";
import { Interruption, type InterruptionProps } from "../../../../domain/value-objects/interruption";

export interface EventDocument {
  id: string;
  type: EventType;
  userId: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  interruptions: Array<Omit<InterruptionProps, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string }>;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class EventDocumentMapper {
  static toPersistence(event: DomainEvent): EventDocument {
    const now = new Date().toISOString();
    return {
      id: event.id,
      type: event.type,
      userId: event.userId,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt.toISOString(),
      finishedAt: event.finishedAt?.toISOString(),
      tags: event.tags,
      interruptions: event.interruptions.map((interruption) => ({
        name: interruption.name,
        description: interruption.description,
        startedAt: interruption.startedAt.toISOString(),
        finishedAt: interruption.finishedAt.toISOString(),
      })),
      data: this.toPersistenceData(event),
      createdAt: now,
      updatedAt: now,
    };
  }

  static toDomain(document: EventDocument): DomainEvent {
    const props = {
      id: document.id,
      userId: document.userId,
      name: document.name,
      description: document.description,
      startedAt: new Date(document.startedAt),
      finishedAt: document.finishedAt ? new Date(document.finishedAt) : undefined,
      tags: document.tags,
      interruptions: document.interruptions.map((interruption) =>
        Interruption.create({
          name: interruption.name,
          description: interruption.description,
          startedAt: new Date(interruption.startedAt),
          finishedAt: new Date(interruption.finishedAt),
        }),
      ),
    };

    switch (document.type) {
      case "routine":
        return RoutineEvent.create({ ...props, data: document.data as RoutineEventData });
      case "training":
        return TrainingEvent.create({ ...props, data: document.data as unknown as TrainingEventData });
      case "sleep":
        return SleepEvent.create({ ...props, data: document.data as unknown as SleepEventData });
      case "food": {
        const data = document.data as unknown as Omit<FoodEventData, "parsedAt"> & { parsedAt: string };
        return FoodEvent.create({ ...props, data: { ...data, parsedAt: new Date(data.parsedAt) } });
      }
    }
  }

  private static toPersistenceData(event: DomainEvent): Record<string, unknown> {
    if (!(event instanceof FoodEvent)) return event.data as Record<string, unknown>;
    return { ...event.data, parsedAt: event.data.parsedAt.toISOString() };
  }
}
