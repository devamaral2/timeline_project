import type { AgendaEventCard } from "./agenda-day";

/**
 * Onde o evento esta em relacao a agora, pelo bloco dele na agenda. Sao tres
 * estados, e nao dois: a agenda registra tambem o que ainda vai acontecer,
 * entao "sem fim planejado" nao significa "acontecendo agora": pode ser um
 * compromisso de amanha, que nao tem cronometro nenhum para mostrar.
 */
export type EventPosition = "upcoming" | "running" | "past";

export function eventPositionOf(
  event: Pick<AgendaEventCard, "startedAt" | "estimatedFinishAt">,
  now: Date = new Date(),
): EventPosition {
  const started = new Date(event.startedAt).getTime();
  if (now.getTime() < started) return "upcoming";
  if (!event.estimatedFinishAt) return "running";
  return new Date(event.estimatedFinishAt).getTime() <= now.getTime() ? "past" : "running";
}

/** Duracao do bloco do evento em minutos, ou null quando ele nao tem fim planejado. */
export function durationMinutesOf(event: AgendaEventCard): number | null {
  if (!event.estimatedFinishAt) return null;
  const started = new Date(event.startedAt).getTime();
  const finished = new Date(event.estimatedFinishAt).getTime();
  return Math.round((finished - started) / 60000);
}

/** Soma das duracoes dos eventos ja encerrados, em minutos. */
export function trackedMinutesOf(events: readonly AgendaEventCard[]): number {
  return events.reduce((total, event) => total + (durationMinutesOf(event) ?? 0), 0);
}

/**
 * Fracao minima da barra de duracao. Um evento de um minuto ao lado de um de
 * tres horas sairia com largura zero — e uma barra invisivel nao diz "curto",
 * diz "quebrado".
 */
export const MIN_DURATION_RATIO = 0.06;

/** Maior duracao entre os eventos ja encerrados, em minutos. */
export function longestDurationOf(events: readonly AgendaEventCard[]): number {
  return events.reduce((longest, event) => Math.max(longest, durationMinutesOf(event) ?? 0), 0);
}

/**
 * Largura da barra de duracao, de 0 a 1, comparada ao evento mais longo do
 * mesmo dia — a referencia e o dia porque e o que esta na tela junto.
 *
 * Devolve `null` para o evento em andamento: ele ainda nao tem duracao, e
 * desenhar uma barra qualquer seria inventar um numero.
 */
export function durationRatioOf(
  event: AgendaEventCard,
  longestMinutes: number,
): number | null {
  const minutes = durationMinutesOf(event);
  if (minutes === null) return null;
  if (longestMinutes <= 0) return MIN_DURATION_RATIO;
  return Math.min(1, Math.max(MIN_DURATION_RATIO, minutes / longestMinutes));
}

/** Segundos corridos desde o inicio do evento, nunca negativo. */
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
 * O cronometro de um evento em andamento, ou `null` quando ele ja terminou ou
 * ainda nem comecou -- um evento futuro ficaria travado em `0:00`, o que le
 * como quebrado e nao como "ainda nao".
 */
export function stopwatchOf(event: AgendaEventCard, now: Date = new Date()): string | null {
  if (eventPositionOf(event, now) !== "running") return null;
  return formatStopwatch(elapsedSecondsOf(event.startedAt, now));
}
