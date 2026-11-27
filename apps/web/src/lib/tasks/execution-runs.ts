import { IN_PROGRESS_AGENT_STATUSES, isExecutionRun } from "@repo/contracts";
import type { TaskCardDto, TaskStatus } from "@repo/contracts";

/**
 * O que a gaveta de execução lê da lista de tarefas acompanhadas: as execuções de agente em andamento, da mais
 * recente para a mais antiga, e quantas linhas cada altura da gaveta deixa à mostra. Funções puras.
 */

/** O filtro de status da consulta: os status em andamento, vindos do grupo dos contratos. */
export const EXECUTION_STATUS_FILTER: TaskStatus[] = [...IN_PROGRESS_AGENT_STATUSES];

/** As alturas da gaveta: uma linha, três linhas (padrão) ou todas. */
export type ExecutionDrawerMode = "one" | "three" | "all";
export const DEFAULT_EXECUTION_MODE: ExecutionDrawerMode = "three";

/** Quantas execuções a altura de três mostra. */
export const EXECUTION_PEEK = 3;

/** Da menor para a maior: a gaveta cresce quando a nova altura tem posto maior. */
const RANK: Record<ExecutionDrawerMode, number> = { one: 1, three: 2, all: 3 };

export function isExecutionMode(value: unknown): value is ExecutionDrawerMode {
  return value === "one" || value === "three" || value === "all";
}

/** A gaveta cresce ao ir de `from` para `to`? */
export function drawerGrows(from: ExecutionDrawerMode, to: ExecutionDrawerMode): boolean {
  return RANK[to] > RANK[from];
}

/**
 * As execuções que a gaveta mostra: tarefa de agente em andamento que não é passo nem execução agendada, da que
 * começou há menos tempo para a que começou há mais. Sem início, vai para o fim; o desempate é o id.
 */
export function executionRunsOf(cards: readonly TaskCardDto[]): TaskCardDto[] {
  const startOf = (card: TaskCardDto) => (card.startedAt ? Date.parse(card.startedAt) : Number.NEGATIVE_INFINITY);
  return cards
    .filter(isExecutionRun)
    .sort((a, b) => startOf(b) - startOf(a) || b.id.localeCompare(a.id));
}

/** Quantas linhas a altura deixa à mostra. */
export function shownRowCount(mode: ExecutionDrawerMode, total: number): number {
  if (mode === "one") return Math.min(total, 1);
  if (mode === "three") return Math.min(total, EXECUTION_PEEK);
  return total;
}
