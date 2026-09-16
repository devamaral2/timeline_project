import { eventPositionOf, formatTime } from "@repo/timeline";

interface EventWindow {
  startedAt: string;
  finishedAt?: string;
}

/**
 * O que vai depois da seta na janela do evento. Um evento sem `finishedAt` nao
 * quer mais dizer "acontecendo agora": pode ser um compromisso de amanha, que
 * ainda nao comecou e portanto nao esta em andamento nenhum.
 *
 * `now` nulo e o estado antes da hidratacao — sem relogio, respondemos o mesmo
 * que o servidor respondeu, e o rotulo se corrige quando o cliente assume.
 */
export function endLabelOf(event: EventWindow, now: Date | null): string {
  if (event.finishedAt) return formatTime(event.finishedAt);
  if (now && eventPositionOf(event, now) === "upcoming") return "sem hora de fim";
  return "em andamento";
}
