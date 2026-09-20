import type { TimelineEventCardDto } from "./timeline-event-card.dto";

export interface TimelineEventPageDto {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}
