import type { AgentTaskStatus, Situation } from "./sets";

/**
 * Os quatro grupos de status de agente. E aqui, e so aqui, que se decide se um pedido ou um passo
 * esta aberto, em andamento, terminou ou terminou bem. Quem pergunta usa os predicados; quem monta SQL
 * usa as listas. So onde a API grava um status especifico sobra o literal.
 */

/** Ainda nao terminou: pode ser cancelado e ainda vai mudar. */
export const OPEN_AGENT_STATUSES = ["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription"] as const satisfies readonly AgentTaskStatus[];
/** Aberto e com trabalho a fazer ou em curso, fora a espera da pessoa; esperar a transcricao e trabalho em curso fora daqui. */
export const IN_PROGRESS_AGENT_STATUSES = ["preparing", "queued", "starting", "running", "awaiting_transcription"] as const satisfies readonly AgentTaskStatus[];
/** Terminou, de qualquer jeito. */
export const FINAL_AGENT_STATUSES = ["completed", "interrupted", "failed", "cancelled", "rolled_back"] as const satisfies readonly AgentTaskStatus[];
/** Terminou bem. */
export const SUCCESS_AGENT_STATUSES = ["completed"] as const satisfies readonly AgentTaskStatus[];
/** A execucao parou no meio: pode haver trabalho pela metade. */
export const INTERRUPTED_AGENT_STATUSES = ["interrupted"] as const satisfies readonly AgentTaskStatus[];
/** O usuario cancelou o pedido antes de ele trabalhar. */
export const CANCELLED_AGENT_STATUSES = ["cancelled"] as const satisfies readonly AgentTaskStatus[];

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

export function isInterruptedAgentStatus(status: string | null | undefined): boolean {
  return isIn(INTERRUPTED_AGENT_STATUSES, status);
}

export function isCancelledAgentStatus(status: string | null | undefined): boolean {
  return isIn(CANCELLED_AGENT_STATUSES, status);
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
  awaiting_transcription: ["running", "failed", "cancelled"],
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

/**
 * A politica de parar um pedido ou passo, num lugar so: o que estava `running` deixa `interrupted` (pode haver trabalho
 * pela metade), o que ainda nao comecou deixa `cancelled`. O SQL do Postgres e o store em memoria leem estas constantes.
 */
export const STOPPABLE_RUNNING_STATUS = "running" as const satisfies AgentTaskStatus;
export const STOPPED_FROM_RUNNING = "interrupted" as const satisfies AgentTaskStatus;
export const STOPPED_BEFORE_RUNNING = "cancelled" as const satisfies AgentTaskStatus;

export function stoppedStatusOf(status: AgentTaskStatus): typeof STOPPED_FROM_RUNNING | typeof STOPPED_BEFORE_RUNNING {
  return status === STOPPABLE_RUNNING_STATUS ? STOPPED_FROM_RUNNING : STOPPED_BEFORE_RUNNING;
}

/**
 * A politica de revisao, num lugar so: a gravacao que fecha um pedido, em qualquer status final, deixa nele esta
 * situacao. O check do banco vale so num sentido (uma tarefa final pode ficar sem situacao), para que mudar a
 * politica depois nao peca migration.
 */
export const REVIEW_SITUATION_ON_CLOSE = "to_review" as const satisfies Situation;

/**
 * Quem nunca tem situacao (o passo e a execucao agendada) e quem a aceita (um pedido de agente num status final): a regra
 * mora nos contratos, onde o esquema do cartao e a gaveta de execucao do web a alcancam.
 */
export { acceptsSituation, KINDS_WITHOUT_SITUATION } from "@repo/contracts";
