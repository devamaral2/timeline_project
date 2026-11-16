import type { AgendaTaskCard } from "./agenda-day";

/**
 * Onde a tarefa esta em relacao a agora, pelo bloco dele na agenda. Sao tres
 * estados, e nao dois: a agenda registra tambem o que ainda vai acontecer,
 * entao "sem fim planejado" nao significa "acontecendo agora": pode ser um
 * compromisso de amanha, que nao tem cronometro nenhum para mostrar.
 */
export type TaskPosition = "upcoming" | "running" | "past";

export function taskPositionOf(
  task: Pick<AgendaTaskCard, "startedAt" | "estimatedFinishAt">,
  now: Date = new Date(),
): TaskPosition {
  const started = new Date(task.startedAt).getTime();
  if (now.getTime() < started) return "upcoming";
  if (!task.estimatedFinishAt) return "running";
  return new Date(task.estimatedFinishAt).getTime() <= now.getTime() ? "past" : "running";
}

/** Duracao do bloco da tarefa em minutos, ou null quando ele nao tem fim planejado. */
export function durationMinutesOf(task: AgendaTaskCard): number | null {
  if (!task.estimatedFinishAt) return null;
  const started = new Date(task.startedAt).getTime();
  const finished = new Date(task.estimatedFinishAt).getTime();
  return Math.round((finished - started) / 60000);
}

/** Soma das duracoes das tarefas ja encerradas, em minutos. */
export function trackedMinutesOf(tasks: readonly AgendaTaskCard[]): number {
  return tasks.reduce((total, task) => total + (durationMinutesOf(task) ?? 0), 0);
}

/**
 * Fracao minima da barra de duracao. Uma tarefa de um minuto ao lado de um de
 * tres horas sairia com largura zero — e uma barra invisivel nao diz "curto",
 * diz "quebrado".
 */
export const MIN_DURATION_RATIO = 0.06;

/** Maior duracao entre as tarefas ja encerradas, em minutos. */
export function longestDurationOf(tasks: readonly AgendaTaskCard[]): number {
  return tasks.reduce((longest, task) => Math.max(longest, durationMinutesOf(task) ?? 0), 0);
}

/**
 * Largura da barra de duracao, de 0 a 1, comparada a tarefa mais longa do
 * mesmo dia — a referencia e o dia porque e o que esta na tela junto.
 *
 * Devolve `null` para a tarefa em andamento: ela ainda nao tem duracao, e
 * desenhar uma barra qualquer seria inventar um numero.
 */
export function durationRatioOf(
  task: AgendaTaskCard,
  longestMinutes: number,
): number | null {
  const minutes = durationMinutesOf(task);
  if (minutes === null) return null;
  if (longestMinutes <= 0) return MIN_DURATION_RATIO;
  return Math.min(1, Math.max(MIN_DURATION_RATIO, minutes / longestMinutes));
}

/** Segundos corridos desde o inicio da tarefa, nunca negativo. */
export function elapsedSecondsOf(startedAt: string, now: Date = new Date()): number {
  const started = new Date(startedAt).getTime();
  return Math.max(0, Math.floor((now.getTime() - started) / 1000));
}

/**
 * A leitura do cronometro: `MM:SS` na primeira hora, `H:MM:SS` daí em diante.
 *
 * E de proposito que ela nao se pareca com a duracao escrita de um bloco
 * ("1h 25m"): aquela e o tamanho do que foi planejado, este e um numero que
 * ainda esta subindo. Formatos diferentes para coisas diferentes.
 */
export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const padded = (value: number): string => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${minutes}:${padded(seconds)}`;
}

/**
 * O cronometro de uma tarefa em andamento, ou `null` quando ele ja terminou ou
 * ainda nem comecou -- uma tarefa futura ficaria travada em `0:00`, o que le
 * como quebrado e nao como "ainda nao".
 */
export function stopwatchOf(task: AgendaTaskCard, now: Date = new Date()): string | null {
  if (taskPositionOf(task, now) !== "running") return null;
  return formatStopwatch(elapsedSecondsOf(task.startedAt, now));
}
