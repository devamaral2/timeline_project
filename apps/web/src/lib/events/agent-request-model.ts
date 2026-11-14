import type { AgentEventStatus, RequestDto } from "@repo/contracts";

/**
 * O que o detalhe do evento de agente lê do pedido: se ainda está em aberto (e portanto se relê) e a
 * contagem de passos feitos. Funções puras; a tela só as chama.
 */

const OPEN_STATUSES: readonly AgentEventStatus[] = ["queued", "running", "waiting"];

/** Pedido em fila, executando ou aguardando o usuário: a tela continua relendo. */
export function isOpenRequest(status: AgentEventStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Quantos passos terminaram e quantos há no total. */
export function stepProgress(steps: RequestDto["steps"]): { done: number; total: number } {
  return { done: steps.filter((step) => step.status === "done").length, total: steps.length };
}

/** "2 de 4 passos", "1 de 1 passo", "0 de 0 passos". */
export function stepProgressLabel({ done, total }: { done: number; total: number }): string {
  return `${done} de ${total} ${total === 1 ? "passo" : "passos"}`;
}
