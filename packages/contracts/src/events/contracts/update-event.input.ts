import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { UpdateEventNoteInput } from "../../notes/contracts/note.dto";
import type { EventKind } from "../types/event-kind";

export interface InterruptionPatchInput {
  id?: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface UpdateEventInput {
  eventId: string;
  expectedRevision: number;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  interruptions?: InterruptionPatchInput[];
  kind?: EventKind;
  /** A lista completa de notes do evento, na ordem. As que nao estao nela deixam de aparecer, mas nao sao apagadas. */
  notes?: UpdateEventNoteInput[];
  taskIds?: string[];
}
