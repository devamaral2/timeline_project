import type { AgentTaskStatus } from "./sets";

/**
 * Os quatro grupos de status de agente. E aqui, e so aqui, que se decide se um pedido ou um passo
 * esta aberto, em andamento, terminou ou terminou bem. Quem pergunta usa os predicados; quem monta SQL
 * usa as listas. So onde a API grava um status especifico sobra o literal.
 */

/** Ainda nao terminou: pode ser cancelado e ainda vai mudar. */
export const OPEN_AGENT_STATUSES = ["preparing", "queued", "starting", "running", "waiting"] as const satisfies readonly AgentTaskStatus[];
/** Aberto e com trabalho a fazer ou em curso (fora a espera). */
export const IN_PROGRESS_AGENT_STATUSES = ["preparing", "queued", "starting", "running"] as const satisfies readonly AgentTaskStatus[];
/** Terminou, de qualquer jeito. */
export const FINAL_AGENT_STATUSES = ["completed", "interrupted", "failed", "cancelled", "rolled_back"] as const satisfies readonly AgentTaskStatus[];
/** Terminou bem. */
export const SUCCESS_AGENT_STATUSES = ["completed"] as const satisfies readonly AgentTaskStatus[];

function isIn(group: readonly string[], status: string | null | undefined): boolean {
  return status != null && group.includes(status);
}

export function isOpenAgentStatus(status: string | null | undefined): boolean {
  return isIn(OPEN_AGENT_STATUSES, status);
}

export function isInProgressAgentStatus(status: string | null | undefined): boolean {
  return isIn(IN_PROGRESS_AGENT_STATUSES, status);
}

export function isFinalAgentStatus(status: string | null | undefined): boolean {
  return isIn(FINAL_AGENT_STATUSES, status);
}

export function isSuccessAgentStatus(status: string | null | undefined): boolean {
  return isIn(SUCCESS_AGENT_STATUSES, status);
}
