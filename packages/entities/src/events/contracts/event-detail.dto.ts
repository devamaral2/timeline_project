import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { EventItemDto } from "./event-item.dto";

export interface EventDetailInterruptionDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt: string;
}

export interface EventDetailDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  /** A anotacao de nao realizado — e esta que o formulario de edicao altera. */
  missed: boolean;
  priority: EventPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  interruptions: EventDetailInterruptionDto[];
  revision: number;
  primaryItemId: string;
  items: EventItemDto[];
  taskIds?: string[];
}
