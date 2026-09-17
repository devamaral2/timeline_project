import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { UpdateEventItemInput } from "./event-item.dto";

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
  items?: UpdateEventItemInput[];
  taskIds?: string[];
}
