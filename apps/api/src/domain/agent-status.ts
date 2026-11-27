import type { Actor, AgentTaskStatus, Situation, TaskKind } from "./sets";

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

/**
 * A politica de revisao, num lugar so: a gravacao que fecha um pedido, em qualquer status final, deixa nele esta
 * situacao. O check do banco vale so num sentido (uma tarefa final pode ficar sem situacao), para que mudar a
 * politica depois nao peca migration.
 */
export const REVIEW_SITUATION_ON_CLOSE = "to_review" as const satisfies Situation;

/** Os tipos de tarefa de agente que nunca tem situacao: o passo de um pedido e a execucao agendada. */
export const KINDS_WITHOUT_SITUATION = ["step", "cron"] as const satisfies readonly TaskKind[];

/** A tarefa aceita situacao: e um pedido de agente (nao passo nem execucao agendada) num status final. */
export function acceptsSituation(task: { actor: Actor; kind: string; status: string | null | undefined }): boolean {
  return (
    task.actor === "agent" &&
    !(KINDS_WITHOUT_SITUATION as readonly string[]).includes(task.kind) &&
    isFinalAgentStatus(task.status)
  );
}
