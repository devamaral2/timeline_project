import type { EventKind } from "../types/event-kind";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";

export interface TimelineEventCardDto {
  id: string;
  kind: EventKind;
  /** Os tipos das notes do evento, na ordem em que aparecem. */
  noteTypes: string[];
  /** A anotacao do usuario. O cartao so desenha o selo quando ela e true. */
  missed: boolean;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}
