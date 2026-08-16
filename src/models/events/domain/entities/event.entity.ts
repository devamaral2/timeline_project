import type { EventType } from "../types/event-type";
import type { Interruption } from "../value-objects/interruption";

export interface EventProps<TData> {
  id?: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  interruptions: Interruption[];
  data: TData;
}

export abstract class Event<TData> {
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
  ) {
    if (finishedAt && finishedAt < startedAt) {
      throw new Error("finishedAt must be equal to or after startedAt");
    }
  }

  getDurationMinutes(): number | null {
    if (!this.finishedAt) return null;
    return Math.round((this.finishedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
}
