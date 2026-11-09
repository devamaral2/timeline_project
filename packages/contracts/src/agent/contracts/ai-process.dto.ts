import type { AgentScreenContext } from "./agent-run.dto";

export type AiProcessStatus = "dispatching" | "running" | "completed" | "failed";
export type AiProcessStepStatus = "pending" | "running" | "succeeded" | "failed";

/** As linhas de uma consulta, limitadas pelo servidor. */
export interface AiProcessQueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

/** Um trabalho do processo; o `label` ja e o texto predefinido que a caixa mostra. */
export interface AiProcessStepDto {
  id: string;
  agent: string;
  label: string;
  status: AiProcessStepStatus;
  errorCode?: string;
  /** Linhas da consulta, so no passo de consulta. */
  result?: AiProcessQueryResult;
}

export interface AiProcessEntityDto {
  kind: "event" | "task" | "note";
  id: string;
  name: string;
  operation: "create" | "update";
  linkedTo: Array<{ kind: string; id: string }>;
}

/**
 * A caixa de processo (`GET /api/ai/process/:id`): titulo, passos com seu estado e, no fim, a mensagem
 * (resposta do fallback ou o que falhou). Todo texto de sucesso e predefinido; nada aqui passa por modelo.
 */
export interface AiProcessDto {
  id: string;
  status: AiProcessStatus;
  title: string;
  steps: AiProcessStepDto[];
  entities: AiProcessEntityDto[];
  message?: string;
}

/** `POST /api/ai/process`. Responde 404 quando a rota por processo esta desligada no servidor. */
export interface StartAiProcessRequest {
  userId: string;
  text: string;
  context?: AgentScreenContext;
}

export interface StartAiProcessResponse {
  processId: string;
}

export function isAiProcessTerminal(process: Pick<AiProcessDto, "status">): boolean {
  return process.status === "completed" || process.status === "failed";
}

/**
 * O tipo da entidade que a tela de detalhe esta editando. A nota carrega o subtipo (`meal_note`, `sleep_note`,
 * `training_note`, `skill_note`, `agent_note`); `note` e a nota de texto. O servidor confere contra a entidade real.
 */
export type AiProcessEditEntityType =
  | "event" | "task" | "note" | "meal_note" | "sleep_note" | "training_note" | "skill_note" | "agent_note";

/** `POST /api/ai/process/edit`: um pedido de edicao da entidade aberta na tela. Responde `202 { processId }`. */
export interface StartAiProcessEditRequest {
  userId: string;
  text: string;
  entityType: AiProcessEditEntityType;
  entityId: string;
}
