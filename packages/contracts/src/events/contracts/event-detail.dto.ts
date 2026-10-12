import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { NoteDto } from "../../notes/contracts/note.dto";
import type { EventKind } from "../types/event-kind";

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
  kind: EventKind;
  /** As notes do evento, na ordem em que aparecem. */
  notes: NoteDto[];
  taskIds?: string[];
}
