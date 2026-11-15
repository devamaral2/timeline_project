import type { EventCardDto, EventPriority } from "@repo/contracts";
import type { TrackedFilters } from "@/lib/api/events";

/**
 * Filtros da lista de tarefas. Função pura, sem rede: a tela passa o estado
 * daqui para `listTrackedEvents`, que os manda como parâmetros da consulta.
 */

/** Ordem fixa dos níveis: é a ordem dos chips e a do parâmetro `priority`. */
export const PRIORITY_ORDER: readonly EventPriority[] = ["urgent", "high", "medium", "low"];

export interface TaskFilterState {
  /** Uma tag só, como a API aceita. */
  tag: string | null;
  /** Vários níveis ao mesmo tempo; vazio quer dizer todos. */
  priorities: readonly EventPriority[];
  /** Texto já aplicado (sem espaços nas pontas). */
  query: string;
}

/** Quantos filtros estão ativos: o selo do botão de opções e o "Limpar filtros". */
export function taskFilterCount(filters: TaskFilterState): number {
  return (filters.tag ? 1 : 0) + (filters.priorities.length > 0 ? 1 : 0) + (filters.query ? 1 : 0);
}

/** Os parâmetros da consulta. Lista vazia e texto vazio não vão à rede. */
export function trackedFilters(filters: TaskFilterState): TrackedFilters {
  const priority = PRIORITY_ORDER.filter((level) => filters.priorities.includes(level));
  return {
    tag: filters.tag ?? undefined,
    priority: priority.length > 0 ? priority : undefined,
    q: filters.query || undefined,
  };
}

/** Tags da lista sem filtro, da mais usada para a menos usada (empate: pelo nome). */
export function tagsByUse(cards: readonly EventCardDto[]): string[] {
  const uses = new Map<string, number>();
  for (const card of cards) for (const tag of card.tags) uses.set(tag, (uses.get(tag) ?? 0) + 1);
  return [...uses.keys()].sort(
    (left, right) => (uses.get(right) ?? 0) - (uses.get(left) ?? 0) || left.localeCompare(right, "pt-BR"),
  );
}
