import type { TaskKind } from "../../sets";

/**
 * So `Task.create` usa isto — tarefa nova sem `finishedAt` declarado nasce
 * com uma duracao estimada pela natureza da tarefa, nunca em aberto: um
 * treino estima 1h30 mesmo que o usuario nao tenha dito quanto tempo.
 */
export const DEFAULT_TASK_KIND_DURATION_MINUTES: Partial<Record<TaskKind, number>> = {
  meal: 20,
  sleep: 7 * 60,
  training: 90,
};

/** Duracao de quem nao tem estimativa propria (a rotina). */
export const DEFAULT_TASK_DURATION_MINUTES = 60;

export function defaultTaskDurationMinutesFor(kind: TaskKind | undefined): number {
  if (kind === undefined) return DEFAULT_TASK_DURATION_MINUTES;
  return DEFAULT_TASK_KIND_DURATION_MINUTES[kind] ?? DEFAULT_TASK_DURATION_MINUTES;
}
