import type { ArtifactType } from "../artifacts/artifact.dto";
import type { AgentTaskStatus, AgentRequestKind } from "../tasks/task-types";
import type { GeoPointInput } from "../tasks/place-suggestion.dto";
import type { AgentTraceDto } from "./agent-trace.dto";

/**
 * Por onde o pedido anda: `steps` desdobra o pedido em passos de agentes de
 * entidade (ADR 003); `hermes` entrega a mensagem ao Hermes (ADR 004); `voice`
 * transforma uma fala numa tarefa; `food` calcula os nutrientes de um alimento.
 */
export type RequestRoute = "steps" | "hermes" | "voice" | "food";

/** Por que um pedido falhou. */
export type RequestErrorCode =
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  | "unavailable"
  | "cancelled"
  | "internal";

/** Tela em que o usuario estava. So ids: o agente busca os dados ele mesmo. */
export interface RequestScreenContext {
  screen: string;
  entityId?: string;
  /** Onde a pessoa esta (lido pelo navegador): as tarefas que o pedido cria nascem com o endereco daqui. */
  coordinates?: GeoPointInput;
}

/** As linhas de uma consulta, limitadas pelo servidor. */
export interface RequestQueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

/** Um passo do pedido; o `label` ja e o texto predefinido que a caixa mostra. */
export interface RequestStepDto {
  id: string;
  /** O agente interno que executa o passo. */
  agent: string;
  label: string;
  status: AgentTaskStatus;
  errorCode?: string;
  /** Linhas da consulta, so no passo de consulta. */
  result?: RequestQueryResult;
}

/** Uma tarefa ou artefato que o pedido criou ou alterou. */
export interface RequestEntityDto {
  kind: "task" | "artifact";
  id: string;
  name: string;
  /** So para `kind: "artifact"`. */
  artifactType?: ArtifactType;
  operation: "create" | "update" | "delete";
  /** As relacoes que o pedido aplicou entre esta entidade e as outras. */
  linkedTo: Array<{ kind: "task" | "artifact"; id: string }>;
}

/**
 * Um pedido ao agente (`GET /api/requests/:id`): o que entrou, os passos com o
 * estado de cada um e, no fim, a resposta. Na rota por passos, todo texto de
 * sucesso e predefinido; nada ali passa por modelo.
 */
export interface RequestDto {
  id: string;
  kind: AgentRequestKind;
  route: RequestRoute;
  status: AgentTaskStatus;
  title: string;
  /** O primeiro pedido da sessao; ausente quando este e o primeiro. */
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  /** O que o usuario escreveu ou falou. */
  text?: string;
  steps: RequestStepDto[];
  entities: RequestEntityDto[];
  /** A resposta do agente, ou o que falhou. */
  message?: string;
  errorCode?: RequestErrorCode;
  /** O que o agente esta fazendo agora; some quando o pedido termina. */
  progress?: string;
  /** O rastro do pedido, para a aba "Processo". */
  trace?: AgentTraceDto;
}

/** `POST /api/requests`. Responde `202 { requestId }`. */
export interface StartRequestInput {
  userId: string;
  text: string;
  context?: RequestScreenContext;
  /** O primeiro pedido da sessao que este continua. */
  sessionId?: string;
  /** Estavel por mensagem: reenviar o mesmo id devolve o pedido ja aceito. */
  clientMessageId?: string;
}

/**
 * O tipo da entidade que a tela de detalhe esta editando. O artefato carrega o
 * tipo (`food_artifact`, `sleep_artifact`, `training_artifact`, `skill_artifact`,
 * `agent_artifact`); `artifact` e o de texto. O servidor confere contra a
 * entidade real.
 */
export type RequestEditEntityType =
  | "task"
  | "artifact"
  | "food_artifact"
  | "sleep_artifact"
  | "training_artifact"
  | "skill_artifact"
  | "agent_artifact";

/** `POST /api/requests/edit`: um pedido de edicao da entidade aberta na tela. Responde `202 { requestId }`. */
export interface StartEditRequestInput {
  userId: string;
  text: string;
  entityType: RequestEditEntityType;
  entityId: string;
}

/** `POST /api/requests/hermes`. Responde `202` com o pedido. So existe quando o servidor liga o Hermes. */
export interface StartHermesRequestInput {
  userId: string;
  text: string;
  sessionId?: string;
  clientMessageId: string;
}

/** `POST /api/requests/voice`. Responde `202 { requestId }`; a tarefa criada aparece em `entities`. */
export interface StartVoiceRequestInput {
  transcript: string;
  /** Onde a pessoa esta: a tarefa criada nasce com o endereco daqui. */
  coordinates?: GeoPointInput;
  clientMessageId?: string;
}

export interface StartRequestResponse {
  requestId: string;
}
