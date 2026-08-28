import { dayKeyOf, shiftDayKey, zonedDayEnd, zonedDayStart } from "./format-date";

/** Cada janela cobre o dia final e os 7 anteriores. */
export const WINDOW_SIZE_IN_DAYS = 8;

/** Quantas janelas vazias seguidas encerravam a timeline incremental legada. */
export const EMPTY_WINDOWS_UNTIL_END = 3;

export interface DateWindow {
  /** Inicio do primeiro dia da janela, em ISO 8601. */
  from: string;
  /** Fim do ultimo dia da janela, em ISO 8601. */
  to: string;
}

/**
 * Janela 0 vai de hoje ate 7 dias atras; a janela 1 do oitavo ao decimo quinto
 * dia anterior, e assim por diante.
 */
export function buildDateWindow(index: number, now: Date = new Date()): DateWindow {
  const todayKey = dayKeyOf(now);
  const lastDayKey = shiftDayKey(todayKey, -WINDOW_SIZE_IN_DAYS * index);
  const firstDayKey = shiftDayKey(lastDayKey, -(WINDOW_SIZE_IN_DAYS - 1));
  return {
    from: zonedDayStart(firstDayKey).toISOString(),
    to: zonedDayEnd(lastDayKey).toISOString(),
  };
}

/** URL da API de timeline para a janela informada. */
export function timelineWindowUrl(userId: string, index: number, now?: Date): string {
  const { from, to } = buildDateWindow(index, now);
  const query = new URLSearchParams({ userId, from, to });
  return `/api/events?${query.toString()}`;
}

/**
 * URL da API para um unico dia civil. Web e mobile usam esta unidade quando a
 * pessoa escolhe uma data no cabecalho.
 */
export function dayEventsUrl(userId: string, dayKey: string): string {
  const query = new URLSearchParams({
    userId,
    from: zonedDayStart(dayKey).toISOString(),
    to: zonedDayEnd(dayKey).toISOString(),
  });
  return `/api/events?${query.toString()}`;
}
