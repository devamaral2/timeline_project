import type { DomainEvent } from "@repo/entities/ports";
import {
  isEventPriority,
  readMissedFlag,
  FoodEvent,
  Interruption,
  RoutineEvent,
  SleepEvent,
  TrainingEvent,
  type EventPriority,
  type EventType,
  type FoodEventData,
  type InterruptionProps,
  type RoutineEventData,
  type SleepEventData,
  type TrainingEventData,
} from "@repo/entities";

export interface EventDocument {
  id: string;
  type: EventType;
  userId: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  /**
   * Opcionais: os documentos gravados antes destes campos nao os tem, e nao ha
   * migracao — quem preenche a lacuna e a leitura. `status` e o campo da versao
   * anterior, que ainda esta gravado por ai e que `readMissedFlag` traduz.
   */
  missed?: boolean;
  priority?: EventPriority;
  /**  So leitura: nada escreve mais este campo. */
  status?: string;
  interruptions: Array<Omit<InterruptionProps, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string }>;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class EventDocumentMapper {
  static toPersistence(event: DomainEvent): EventDocument {
    const now = new Date().toISOString();
    return this.removeUndefined({
      id: event.id,
      type: event.type,
      userId: event.userId,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt.toISOString(),
      finishedAt: event.finishedAt?.toISOString(),
      tags: event.tags,
      missed: event.missed,
      priority: event.priority,
      interruptions: event.interruptions.map((interruption) => ({
        id: interruption.id,
        name: interruption.name,
        description: interruption.description,
        startedAt: interruption.startedAt.toISOString(),
        finishedAt: interruption.finishedAt.toISOString(),
      })),
      data: this.toPersistenceData(event),
      createdAt: now,
      updatedAt: now,
    }) as EventDocument;
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
      // O Firestore nao valida nada: um documento antigo vem sem os campos, e um
      // da versao anterior vem com o `status` que existia antes da marca —
      // `readMissedFlag` cobre os dois. Prioridade desconhecida cai no padrao
      // da entidade, em vez de derrubar a leitura da timeline inteira.
      missed: readMissedFlag(document),
      priority: isEventPriority(document.priority) ? document.priority : undefined,
      interruptions: document.interruptions.map((interruption) =>
        Interruption.create({
          id: interruption.id,
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

  private static removeUndefined(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.removeUndefined(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, this.removeUndefined(item)]),
      );
    }

    return value;
  }
}
