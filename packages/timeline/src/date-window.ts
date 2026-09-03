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
 * Filtros opcionais da listagem de um dia.
 *
 * Nao ha `userId` aqui, e nao pode haver: quem responde por autorizacao e o
 * token no cabecalho. Um id na query so voltaria a abrir a porta que a Task 10
 * fechou — o backend le o dono do evento do proprio token e ignora qualquer
 * outra coisa.
 */
export interface DayEventsQuery {
  /** Tipo de item (`meal`, `sleep`, ...) que o evento precisa conter. */
  itemType?: string;
  /** Cursor opaco devolvido pela pagina anterior. */
  cursor?: string;
  limit?: number;
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
export function timelineWindowUrl(index: number, now?: Date): string {
  const { from, to } = buildDateWindow(index, now);
  return `/api/events?${new URLSearchParams({ from, to }).toString()}`;
}

/**
 * URL da API para um unico dia civil. Web e mobile usam esta unidade quando a
 * pessoa escolhe uma data no cabecalho.
 */
export function dayEventsUrl(dayKey: string, query: DayEventsQuery = {}): string {
  const parameters = new URLSearchParams({
    from: zonedDayStart(dayKey).toISOString(),
    to: zonedDayEnd(dayKey).toISOString(),
  });
  // O nome do parametro no backend e `type`; aqui ele se chama `itemType`
  // porque o que se filtra e o item, e nao mais o evento inteiro.
  if (query.itemType) parameters.set("type", query.itemType);
  if (query.cursor) parameters.set("cursor", query.cursor);
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  return `/api/events?${parameters.toString()}`;
}
