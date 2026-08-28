import type { TimelineEventCardDto } from "@repo/entities/contracts";

/** Um dia da timeline com os eventos exibidos para ele. */
export interface TimelineDay {
  /** Chave no formato YYYY-MM-DD no fuso da timeline. */
  dayKey: string;
  isToday: boolean;
  events: TimelineEventCardDto[];
}
