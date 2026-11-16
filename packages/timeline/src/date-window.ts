import { zonedDayEnd, zonedDayStart } from "./format-date";

/**
 * Filtros opcionais da listagem de um dia.
 *
 * Nao ha `userId` aqui, e nao pode haver: quem responde por autorizacao e o
 * token no cabecalho. Um id na query so voltaria a abrir a porta que a Task 10
 * fechou — o backend le o dono da tarefa do proprio token e ignora qualquer
 * outra coisa.
 */
export interface DayTasksQuery {
  /** Tipo de item (`meal`, `sleep`, ...) que a tarefa precisa conter. */
  itemType?: string;
  /** Cursor opaco devolvido pela pagina anterior. */
  cursor?: string;
  limit?: number;
}

/**
 * URL da API para um unico dia civil. Web e mobile usam esta unidade quando a
 * pessoa escolhe uma data no cabecalho.
 */
export function dayTasksUrl(dayKey: string, query: DayTasksQuery = {}): string {
  const parameters = new URLSearchParams({
    from: zonedDayStart(dayKey).toISOString(),
    to: zonedDayEnd(dayKey).toISOString(),
  });
  // O nome do parametro no backend e `type`; aqui ele se chama `itemType`
  // porque o que se filtra e o item, e nao mais a tarefa inteira.
  if (query.itemType) parameters.set("type", query.itemType);
  if (query.cursor) parameters.set("cursor", query.cursor);
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  return `/api/tasks?${parameters.toString()}`;
}
