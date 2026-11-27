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

/** O que um worker de turno (Hermes, modelo, voz, alimento) aceita: uma nova tentativa acha o pedido onde a anterior parou. */
export const TURN_AGENT_STATUSES = ["queued", "starting", "running"] as const satisfies readonly AgentTaskStatus[];

export function isTurnAgentStatus(status: string | null | undefined): boolean {
  return isIn(TURN_AGENT_STATUSES, status);
}

/**
 * As transicoes aceitas. Um status final so segue para `rolled_back`; `cancelled` e `rolled_back` nao saem de onde estao.
 * Quem grava um status so o faz de onde a tabela deixa chegar a ele (`agentStatusesBefore`).
 */
const TRANSITIONS: Record<AgentTaskStatus, readonly AgentTaskStatus[]> = {
  preparing: ["queued", "running", "failed", "cancelled"],
  queued: ["starting", "running", "failed", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: ["waiting", "completed", "failed", "interrupted"],
  waiting: ["running", "failed", "cancelled"],
  completed: ["rolled_back"],
  interrupted: ["rolled_back"],
  failed: ["rolled_back"],
  cancelled: [],
  rolled_back: [],
};

export function canTransitionAgentStatus(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Os status de onde se chega a `to`, na ordem do conjunto: e o que o SQL de cada gravacao usa como guarda. */
export function agentStatusesBefore(to: AgentTaskStatus): AgentTaskStatus[] {
  return (Object.keys(TRANSITIONS) as AgentTaskStatus[]).filter((from) => TRANSITIONS[from].includes(to));
}
