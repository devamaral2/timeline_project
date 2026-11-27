import type { AgentTaskStatus, HumanTaskStatus, TaskActor, TaskStatus } from "./task-types";

/**
 * Os grupos de status de agente: o unico lugar que diz o que e "aberto", "em andamento", "final" e
 * "sucesso". Quem pergunta pelo status de um pedido usa estes grupos, nunca uma lista propria.
 */

/** O pedido ainda nao terminou: a tela continua relendo. */
export const OPEN_AGENT_STATUSES: readonly AgentTaskStatus[] = ["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription"];

/**
 * O pedido esta sendo preparado, na fila, iniciando, executando ou esperando o servico local transcrever o video,
 * sem esperar o usuario.
 */
export const IN_PROGRESS_AGENT_STATUSES: readonly AgentTaskStatus[] = ["preparing", "queued", "starting", "running", "awaiting_transcription"];

/** O pedido terminou, por qualquer motivo. */
export const FINAL_AGENT_STATUSES: readonly AgentTaskStatus[] = ["completed", "interrupted", "failed", "cancelled", "rolled_back"];

/** O pedido terminou bem. */
export const SUCCESS_AGENT_STATUSES: readonly AgentTaskStatus[] = ["completed"];

/** A execucao parou no meio: pode haver trabalho pela metade. */
export const INTERRUPTED_AGENT_STATUSES: readonly AgentTaskStatus[] = ["interrupted"];

/** O usuario cancelou o pedido antes de ele trabalhar. */
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

export function isInterruptedAgentStatus(status: AgentTaskStatus): boolean {
  return INTERRUPTED_AGENT_STATUSES.includes(status);
}

export function isCancelledAgentStatus(status: AgentTaskStatus): boolean {
  return CANCELLED_AGENT_STATUSES.includes(status);
}

/**
 * Os tipos de tarefa de agente que nunca tem situacao: o passo de um pedido, a execucao agendada e o conteudo guardado
 * (`save_content*`, ADR 0021). Quem grava a lista no banco e no SQL le daqui.
 */
export const KINDS_WITHOUT_SITUATION = ["step", "cron", "save_content", "save_content_with_transcription"] as const;

/** Os tipos de agente que a gaveta de execucao nunca mostra: o passo e a execucao agendada (sempre em Continuas). */
export const KINDS_OUTSIDE_EXECUTION_DRAWER = ["step", "cron"] as const;

/** O que as perguntas sobre pedido de agente leem de uma tarefa ou cartao. */
interface AgentTaskFacts {
  actor: string;
  kind: string;
  status?: string | null | undefined;
}

/** E um pedido de agente que pode ter situacao: de agente, e nao passo, execucao agendada nem conteudo guardado. */
export function isAgentRequest(task: AgentTaskFacts): boolean {
  return task.actor === "agent" && !(KINDS_WITHOUT_SITUATION as readonly string[]).includes(task.kind);
}

/** A tarefa aceita situacao: e um pedido de agente num status final. */
export function acceptsSituation(task: AgentTaskFacts): boolean {
  return isAgentRequest(task) && task.status != null && isFinalAgentStatus(task.status as AgentTaskStatus);
}

/**
 * A tarefa e uma execucao: trabalho de agente em andamento (a gaveta de execucao mostra so estas). O conteudo guardado
 * entra, sem situacao; o passo e a execucao agendada nao.
 */
export function isExecutionRun(task: AgentTaskFacts): boolean {
  return task.actor === "agent" && !(KINDS_OUTSIDE_EXECUTION_DRAWER as readonly string[]).includes(task.kind) && task.status != null && isInProgressAgentStatus(task.status as AgentTaskStatus);
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
