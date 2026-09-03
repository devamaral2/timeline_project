import type { EventType } from "../types/event-type";
import { DEFAULT_EVENT_PRIORITY, type EventPriority } from "../types/event-priority";
import { DEFAULT_EVENT_MISSED } from "../types/missed-flag";
import type { Interruption } from "../value-objects/interruption";

/**
 * Base abstrata do agregado Firestore, preservada apenas durante o corte para
 * PostgreSQL (Task 3 a 9). FoodEvent/RoutineEvent/SleepEvent/TrainingEvent
 * continuam estendendo esta classe ate serem removidas na contracao final.
 * Nao exporte isto como `Event` — esse nome agora e do agregado concreto em
 * event.entity.ts.
 */
export interface LegacyEventProps<TData> {
  id?: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  interruptions: Interruption[];
  data: TData;
  /** Opcionais: eventos gravados antes destes campos nao os tem. Veja abaixo. */
  missed?: boolean;
  priority?: EventPriority;
}

export abstract class LegacyEvent<TData> {
  /**
   * A marca de nao realizado e a prioridade sao os unicos campos com valor
   * padrao aqui: todo evento salvo antes deles chega sem nada, e a entidade tem
   * que continuar de pe. Nao ha marca por omissao — nenhum evento e anotado
   * como perdido sem alguem ter dito isso.
   */
  readonly missed: boolean;
  readonly priority: EventPriority;

  protected constructor(
    readonly id: string,
    readonly type: EventType,
    readonly userId: string,
    readonly name: string,
    readonly description: string,
    readonly startedAt: Date,
    readonly finishedAt: Date | undefined,
    readonly tags: string[],
    readonly interruptions: Interruption[],
    readonly data: TData,
    missed?: boolean,
    priority?: EventPriority,
  ) {
    if (finishedAt && finishedAt < startedAt) {
      throw new Error("finishedAt must be equal to or after startedAt");
    }

    this.missed = missed ?? DEFAULT_EVENT_MISSED;
    this.priority = priority ?? DEFAULT_EVENT_PRIORITY;
  }

  getDurationMinutes(): number | null {
    if (!this.finishedAt) return null;
    return Math.round((this.finishedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
}
