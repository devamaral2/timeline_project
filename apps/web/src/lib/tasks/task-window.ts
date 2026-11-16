import { taskPositionOf, formatTime, type TaskPosition } from "@repo/timeline";

interface TaskWindow {
  startedAt: string;
  finishedAt?: string;
}

/**
 * A situacao do evento no tempo. Os DTOs do web ainda chamam o fim planejado de
 * `finishedAt`; `@repo/timeline` le `estimatedFinishAt`. Sem esta traducao, todo
 * evento ja iniciado apareceria em andamento.
 */
export function positionOf(task: TaskWindow, now: Date): TaskPosition {
  return taskPositionOf({ startedAt: task.startedAt, estimatedFinishAt: task.finishedAt }, now);
}

/**
 * O que vai depois da seta na janela do evento. Um evento sem `finishedAt` nao
 * quer mais dizer "acontecendo agora": pode ser um compromisso de amanha, que
 * ainda nao comecou e portanto nao esta em andamento nenhum.
 *
 * `now` nulo e o estado antes da hidratacao — sem relogio, respondemos o mesmo
 * que o servidor respondeu, e o rotulo se corrige quando o cliente assume.
 */
export function endLabelOf(task: TaskWindow, now: Date | null): string {
  if (task.finishedAt) return formatTime(task.finishedAt);
  if (now && positionOf(task, now) === "upcoming") return "sem hora de fim";
  return "em andamento";
}
