import type { TimelineEventCardDto } from "@repo/entities/contracts";

/** Duracao do evento em minutos, ou null enquanto ele nao terminou. */
export function durationMinutesOf(event: TimelineEventCardDto): number | null {
  if (!event.finishedAt) return null;
  const started = new Date(event.startedAt).getTime();
  const finished = new Date(event.finishedAt).getTime();
  return Math.round((finished - started) / 60000);
}

/** Soma das duracoes dos eventos ja encerrados, em minutos. */
export function trackedMinutesOf(events: readonly TimelineEventCardDto[]): number {
  return events.reduce((total, event) => total + (durationMinutesOf(event) ?? 0), 0);
}
