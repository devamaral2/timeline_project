import type { RequestEditEntityType } from "@repo/contracts";

/** Os agentes que a fila de passos executa. O fallback tem fila propria e nao e um passo de entidade. */
export const ENTITY_CREATE_AGENTS = ["event-create", "artifact-create"] as const;
export const SERIES_CREATE_AGENTS = ["recurring-event-create"] as const;
export const CREATE_AGENTS = [...ENTITY_CREATE_AGENTS, ...SERIES_CREATE_AGENTS] as const;
export const ENTITY_EDIT_AGENTS = ["event-edit", "artifact-edit"] as const;
export const SERIES_EDIT_AGENTS = ["recurring-event-edit"] as const;
export const EDIT_AGENTS = [...ENTITY_EDIT_AGENTS, ...SERIES_EDIT_AGENTS] as const;
/** Edicao de um alvo ja conhecido (a tela de detalhe): sem JEV, sem candidatos, so o alvo (ADR 006). */
export const TARGET_EDIT_AGENTS = ["food-edit", "sleep-edit", "training-edit", "agent-file-edit"] as const;
export const STEP_AGENTS = [...CREATE_AGENTS, ...EDIT_AGENTS, ...TARGET_EDIT_AGENTS, "query"] as const;
export type StepAgent = (typeof STEP_AGENTS)[number];
export type RequestAgent = StepAgent | "fallback";

export type CreateAgent = (typeof CREATE_AGENTS)[number];
export type EditAgent = (typeof EDIT_AGENTS)[number];
export type TargetEditAgent = (typeof TARGET_EDIT_AGENTS)[number];

/** Os tipos de job da IA (ADR 0013). Todo job aponta para o pedido ou para o passo que executa. */
export const REQUEST_JOBS = {
  dispatch: "request-dispatch",
  editTarget: "request-edit-target",
  step: "request-step",
  fallback: "request-fallback",
  finalize: "request-finalize",
  hermes: "hermes-turn",
  voice: "voice-event",
} as const;
export type RequestJobKind = (typeof REQUEST_JOBS)[keyof typeof REQUEST_JOBS];

/** O job que executa o passo de cada agente. */
export function jobKindOf(agent: RequestAgent): RequestJobKind {
  return agent === "fallback" ? REQUEST_JOBS.fallback : REQUEST_JOBS.step;
}

/** A finalizacao de um mesmo pedido roda em serie: um job por vez, em ordem de criacao. */
export function finalizeConcurrencyKey(requestId: string): string {
  return `finalize:${requestId}`;
}

/**
 * `fallback: <pedido>` no chat pula o roteamento do JEV e entrega o pedido direto ao fallback. Devolve o pedido
 * sem o prefixo, ou `null` quando a mensagem nao e esse comando (inclusive o prefixo sozinho, sem pedido).
 */
export function parseFallbackCommand(text: string): string | null {
  const request = /^\s*fallback\s*:([\s\S]*)$/i.exec(text)?.[1]?.trim();
  return request ? request : null;
}

export type EntityKind = "event" | "artifact";
export type Expected = "one" | "many";

/** Qual pergunta do JEV de entrada aciona qual agente. */
export const DISPATCH_STEPS: Readonly<Record<string, StepAgent>> = {
  event_create: "event-create",
  artifact_create: "artifact-create",
  event_edit: "event-edit",
  artifact_edit: "artifact-edit",
  recurring_event_create: "recurring-event-create",
  recurring_event_edit: "recurring-event-edit",
  query: "query",
};

/** O que o JEV escolhe como candidato de edicao: as entidades de sempre ou uma serie (recorrencia). */
export type CandidateKind = EntityKind | "recurrence";

/** O que cada agente de edicao altera: define quais candidatos o JEV escolhe para ele. */
export const EDIT_SELECTOR: Readonly<Record<EditAgent, CandidateKind>> = {
  "event-edit": "event",
  "artifact-edit": "artifact",
  "recurring-event-edit": "recurrence",
};

/** O agente de cada tipo de entidade da tela de detalhe: a escolha e esta tabela, nao um modelo. */
export const EDIT_TARGET_AGENTS: Readonly<Record<RequestEditEntityType, StepAgent>> = {
  task: "event-edit",
  artifact: "artifact-edit",
  food_artifact: "food-edit",
  sleep_artifact: "sleep-edit",
  training_artifact: "training-edit",
  skill_artifact: "agent-file-edit",
  agent_artifact: "agent-file-edit",
};

export function isAgent<T extends string>(agents: readonly T[], value: string): value is T {
  return (agents as readonly string[]).includes(value);
}
