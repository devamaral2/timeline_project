import { eventPositionOf, formatTime } from "@repo/timeline";

interface EventWindow {
  startedAt: string;
  finishedAt?: string;
}

/**
 * O que vai depois da seta na janela do evento. Um evento sem `finishedAt` nao
 * quer mais dizer "acontecendo agora": pode ser um compromisso de amanha, que
 * ainda nao comecou e portanto nao esta em andamento nenhum.
 */
export function endLabelOf(event: EventWindow, now: Date = new Date()): string {
  if (event.finishedAt) return formatTime(event.finishedAt);
  return eventPositionOf(event, now) === "upcoming" ? "sem hora de fim" : "em andamento";
}
