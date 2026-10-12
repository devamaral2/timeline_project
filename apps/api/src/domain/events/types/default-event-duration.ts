import type { EventKind } from "./event-kind";

/**
 * So `Event.create` usa isto — evento novo sem `finishedAt` declarado nasce
 * com uma duracao estimada pela natureza do evento, nunca em aberto: um
 * treino estima 1h30 mesmo que o usuario nao tenha dito quanto tempo.
 */
export const DEFAULT_EVENT_KIND_DURATION_MINUTES: Partial<Record<EventKind, number>> = {
  meal: 20,
  sleep: 7 * 60,
  training: 90,
};

/** Duracao de quem nao tem estimativa propria (a rotina). */
export const DEFAULT_EVENT_DURATION_MINUTES = 60;

export function defaultEventDurationMinutesFor(kind: EventKind | undefined): number {
  if (kind === undefined) return DEFAULT_EVENT_DURATION_MINUTES;
  return DEFAULT_EVENT_KIND_DURATION_MINUTES[kind] ?? DEFAULT_EVENT_DURATION_MINUTES;
}
