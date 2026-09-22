/**
 * So `Event.create` usa isto — evento novo sem `finishedAt` declarado nasce
 * com uma duracao estimada pelo tipo do item principal, nunca em aberto. A
 * estimativa e por tipo de item, nao por evento: um evento com item principal
 * de treino estima 1h30 mesmo que o usuario nao tenha dito quanto tempo.
 */
export const DEFAULT_EVENT_ITEM_DURATION_MINUTES: Record<string, number> = {
  meal: 20,
  sleep: 7 * 60,
  training: 90,
};

/** Duracao de quem nao tem estimativa propria (rotina, ou item principal desconhecido). */
export const DEFAULT_EVENT_DURATION_MINUTES = 60;

export function defaultEventDurationMinutesFor(primaryItemType: string | undefined): number {
  if (primaryItemType === undefined) return DEFAULT_EVENT_DURATION_MINUTES;
  return DEFAULT_EVENT_ITEM_DURATION_MINUTES[primaryItemType] ?? DEFAULT_EVENT_DURATION_MINUTES;
}
