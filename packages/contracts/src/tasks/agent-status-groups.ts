import type { AgentTaskStatus, HumanTaskStatus, TaskActor, TaskStatus } from "./task-types";

/**
 * Os grupos de status de agente: o unico lugar que diz o que e "aberto", "em andamento", "final" e
 * "sucesso". Quem pergunta pelo status de um pedido usa estes grupos, nunca uma lista propria.
 */

/** O pedido ainda nao terminou: a tela continua relendo. */
export const OPEN_AGENT_STATUSES: readonly AgentTaskStatus[] = ["preparing", "queued", "starting", "running", "waiting"];

/** O pedido esta sendo preparado, na fila, iniciando ou executando, sem esperar o usuario. */
export const IN_PROGRESS_AGENT_STATUSES: readonly AgentTaskStatus[] = ["preparing", "queued", "starting", "running"];

/** O pedido terminou, por qualquer motivo. */
export const FINAL_AGENT_STATUSES: readonly AgentTaskStatus[] = ["completed", "interrupted", "failed", "cancelled", "rolled_back"];

/** O pedido terminou bem. */
export const SUCCESS_AGENT_STATUSES: readonly AgentTaskStatus[] = ["completed"];

/** O usuario cancelou o pedido. */
export const CANCELLED_AGENT_STATUSES: readonly AgentTaskStatus[] = ["cancelled"];

export function isOpenAgentStatus(status: AgentTaskStatus): boolean {
  return OPEN_AGENT_STATUSES.includes(status);
}

export function isInProgressAgentStatus(status: AgentTaskStatus): boolean {
  return IN_PROGRESS_AGENT_STATUSES.includes(status);
}

export function isFinalAgentStatus(status: AgentTaskStatus): boolean {
  return FINAL_AGENT_STATUSES.includes(status);
}

export function isSuccessAgentStatus(status: AgentTaskStatus): boolean {
  return SUCCESS_AGENT_STATUSES.includes(status);
}

export function isCancelledAgentStatus(status: AgentTaskStatus): boolean {
  return CANCELLED_AGENT_STATUSES.includes(status);
}

/*
 * Perguntas que servem a pessoa e ao agente ao mesmo tempo. Os status de pessoa nao mudam; os de
 * agente vem dos grupos acima. Por isso cada uma recebe o executor.
 */

const HUMAN_CLOSED: readonly HumanTaskStatus[] = ["done", "cancel", "missed"];

/** O lembrete da tarefa se cala: de pessoa, feita ou cancelada; de agente, qualquer status final. */
export function endsReminders(actor: TaskActor, status: TaskStatus | undefined): boolean {
  if (status === undefined) return false;
  if (actor === "agent") return isFinalAgentStatus(status as AgentTaskStatus);
  return status === "done" || status === "cancel";
}

/** A subtarefa esta fechada: o nome sai riscado no tom apagado. */
export function isClosedStatus(actor: TaskActor, status: TaskStatus | undefined): boolean {
  if (status === undefined) return false;
  if (actor === "agent") return isFinalAgentStatus(status as AgentTaskStatus);
  return HUMAN_CLOSED.includes(status as HumanTaskStatus);
}

/** A subtarefa entra na conta de feitas da fracao ("1/4"). */
export function countsAsDone(actor: TaskActor, status: TaskStatus | undefined): boolean {
  if (status === undefined) return false;
  if (actor === "agent") return isSuccessAgentStatus(status as AgentTaskStatus);
  return status === "done";
}
