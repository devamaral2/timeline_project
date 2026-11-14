import type { EventCardDto } from "@repo/contracts";

/** Um evento da agenda: sempre tem inicio. */
export type AgendaEventCard = EventCardDto & { startedAt: string };

/** Um dia da agenda com os eventos exibidos para ele. */
export interface AgendaDay {
  /** Chave no formato YYYY-MM-DD no fuso da agenda. */
  dayKey: string;
  isToday: boolean;
  events: AgendaEventCard[];
}
