import type { RequestEditEntityType } from "@repo/contracts";

/**
 * Os agentes que a fila de passos executa. O Hermes e o modo modelo nao sao passos: o pedido muda de rota
 * (`RequestStore.handToHermes`, `RequestStore.handToModel`).
 */
/** O agente unico de escrita do chat: cria e atualiza tarefas, artefatos de texto e series num lote so. */
export const ENTITY_AGENT = "entity" as const;
/** Edicao de uma tarefa ou de um artefato de texto aberto na tela de detalhe (ADR 006): so o alvo. */
export const ENTITY_EDIT_AGENTS = ["task-edit", "artifact-edit"] as const;
/** Edicao de um alvo ja conhecido (a tela de detalhe): sem JEV, sem candidatos, so o alvo (ADR 006). */
export const TARGET_EDIT_AGENTS = ["food-edit", "sleep-edit", "training-edit", "agent-file-edit"] as const;
export const STEP_AGENTS = [ENTITY_AGENT, ...ENTITY_EDIT_AGENTS, ...TARGET_EDIT_AGENTS, "query"] as const;
export type StepAgent = (typeof STEP_AGENTS)[number];
/**
 * Os agentes que existiam antes do agente unico de escrita e do Hermes como fallback. Nenhum passo novo nasce
 * com eles: so a leitura de pedidos antigos os encontra, e o rotulo deles continua em `ui.json`.
 */
export const LEGACY_STEP_AGENTS = [
  "task-create", "artifact-create", "recurring-task-create", "recurring-task-edit", "fallback",
] as const;
/** O agente de um passo gravado: os de hoje ou, em pedidos antigos, um dos que sairam. */
export type RequestAgent = StepAgent | (typeof LEGACY_STEP_AGENTS)[number];

export type EntityEditAgent = (typeof ENTITY_EDIT_AGENTS)[number];
export type TargetEditAgent = (typeof TARGET_EDIT_AGENTS)[number];

/** Os tipos de job da IA (ADR 0013). Todo job aponta para o pedido ou para o passo que executa. */
export const REQUEST_JOBS = {
  dispatch: "request-dispatch",
  editTarget: "request-edit-target",
  step: "request-step",
  finalize: "request-finalize",
  hermes: "hermes-turn",
  model: "model-turn",
  voice: "voice-task",
} as const;
export type RequestJobKind = (typeof REQUEST_JOBS)[keyof typeof REQUEST_JOBS];

/** A finalizacao de um mesmo pedido roda em serie: um job por vez, em ordem de criacao. */
export function finalizeConcurrencyKey(requestId: string): string {
  return `finalize:${requestId}`;
}

/**
 * `fallback: <pedido>` no chat pula o roteamento do JEV e entrega o pedido direto ao Hermes. Devolve o pedido
 * sem o prefixo, ou `null` quando a mensagem nao e esse comando (inclusive o prefixo sozinho, sem pedido).
 */
export function parseFallbackCommand(text: string): string | null {
  const request = /^\s*fallback\s*:([\s\S]*)$/i.exec(text)?.[1]?.trim();
  return request ? request : null;
}

export type EntityKind = "task" | "artifact";
export type Expected = "one" | "many";

/**
 * As perguntas de sim ou nao do JEV de entrada, uma por destino: `query` e a consulta ao banco, `write` a criacao
 * e a atualizacao de entidades e `config` a configuracao do app, que vai ao modo modelo. Sem nenhum `yes`, o
 * pedido e uma tarefa de agente e vai ao Hermes.
 */
export const DISPATCH_ROUTES = ["query", "write", "config"] as const;
export type DispatchRoute = (typeof DISPATCH_ROUTES)[number];

/** O que o agente de escrita pode alterar: as entidades de sempre ou uma serie (recorrencia). */
export type CandidateKind = EntityKind | "recurrence";
export const CANDIDATE_KINDS: readonly CandidateKind[] = ["task", "artifact", "recurrence"];

/** O agente de cada tipo de entidade da tela de detalhe: a escolha e esta tabela, nao um modelo. */
export const EDIT_TARGET_AGENTS: Readonly<Record<RequestEditEntityType, StepAgent>> = {
  task: "task-edit",
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
