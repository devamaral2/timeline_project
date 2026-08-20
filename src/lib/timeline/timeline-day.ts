import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";

/** Um dia da timeline com os eventos que comecaram nele. */
export interface TimelineDay {
  /** Chave no formato YYYY-MM-DD no fuso da timeline. */
  dayKey: string;
  isToday: boolean;
  events: TimelineEventCardDto[];
}
