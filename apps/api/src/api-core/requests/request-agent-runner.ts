import type { ModelEffort, ModelSelection, RequestQueryResult, RequestScreenContext } from "@repo/contracts";
import type { z } from "zod";
import { FastStageError } from "../agent/errors/agent.errors";
import {
  jsonSchemaOf, type ReasoningEffort, type StructuredCompletionGateway,
} from "../agent/gateways/structured-completion.gateway";
import { formatNow, isoNow, TIME_ZONE } from "../agent/time";
import type { TokenUsage } from "../agent/gateways/structured-completion.gateway";
import type { EditCandidate } from "./request-candidates";
import { loadAgentDefinition, renderAgentPrompt } from "./request-config";
import type { EditTarget, RequestStore } from "./request-store";

/** Quanto do raciocinio de uma chamada fica guardado. */
const MAX_THOUGHT_CHARS = 12_000;
/** Pensando, a chamada leva 1-3 s a mais: o orcamento do agente, medido sem raciocinio, dobra. */
const REASONING_BUDGET = 2;
/**
 * Com o modelo que o usuario escolheu, a chamada pensa no esforco dele e o modelo pode ser bem mais lento que o do
 * servidor: o orcamento do agente, medido num modelo rapido e sem raciocinio, cresce com o esforco.
 */
const SELECTED_BUDGET: Record<ModelEffort, number> = { low: 3, medium: 4, high: 6, max: 9 };
/** Teto de uma chamada no modelo escolhido: um passo faz ate duas, e o cliente desiste do pedido aos 180 s. */
const SELECTED_MAX_MS = 75_000;

export interface AgentRunInput<T> {
  /** Nome do `.md` do agente. */
  agent: string;
  now: Date;
  /** A parte variavel da entrada: pedido, dica de quantidade, contexto de tela. */
  user: string;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  /** O passo por tras da chamada: o que o modelo pensou fica gravado nele, para a aba "Processo". */
  stepId?: string;
  /** A chamada pensa antes de responder, no esforco do runner. Sem isto, nao pensa. */
  think?: boolean;
  /**
   * O provedor, o modelo e o esforco que o usuario escolheu para o pedido. Com ela, a chamada vai a esse modelo e
   * pensa no esforco dela, com ou sem `think`; sem ela, vai ao modelo do servidor.
   */
  model?: ModelSelection;
}

export interface RequestAgentRunnerOptions {
  /** Esforco de raciocinio das chamadas que pedem para pensar (`think`). Sem valor, nenhuma pensa. */
  reasoning?: ReasoningEffort;
  /** Onde o raciocinio de cada chamada fica guardado. */
  thoughts?: Pick<RequestStore, "recordThought" | "recordUsage">;
  clock?: () => Date;
}

/**
 * Uma chamada estruturada por agente, sem ferramentas: o `.md` e o prompt de sistema, o schema Zod e o
 * contrato da saida. Resposta fora do schema falha o passo; nao ha segunda interpretacao.
 *
 * A chamada que pede `think`, com `reasoning` configurado, pensa antes de responder e o que o modelo pensou vai
 * para o passo assim que a chamada volta, antes de a saida ser validada: o raciocinio de uma resposta recusada e
 * o que mais interessa conferir. As outras nao pensam: sao extracoes curtas, e pensar custa 1-3 s por chamada.
 *
 * Com o modelo escolhido pelo usuario (`model`), quem decide o esforco e ele: toda chamada do pedido vai a esse
 * modelo, numa tentativa so e com o orcamento esticado pelo esforco.
 */
export class RequestAgentRunner {
  constructor(
    private readonly gateway: StructuredCompletionGateway,
    private readonly options: RequestAgentRunnerOptions = {},
  ) {}

  async run<T>(input: AgentRunInput<T>): Promise<{ value: T; modelName: string; reasoning?: string }> {
    const definition = loadAgentDefinition(input.agent);
    const selection = input.model;
    const effort = !selection && input.think ? this.options.reasoning : undefined;
    const timeoutMs = selection
      ? Math.min(definition.timeoutMs * SELECTED_BUDGET[selection.effort], SELECTED_MAX_MS)
      : definition.timeoutMs * (effort ? REASONING_BUDGET : 1);
    const { value, modelName, reasoning, usage } = await this.gateway.complete({
      system: renderAgentPrompt(definition, {
        now: formatNow(input.now),
        nowIso: isoNow(input.now),
        timeZone: TIME_ZONE,
      }),
      user: input.user,
      schemaName: definition.name.replace(/-/g, "_"),
      schema: jsonSchemaOf(input.schema),
      timeoutMs,
      // No modelo escolhido a chamada lenta e a regra, nao a cauda: cortar no meio para tentar de novo so perde tempo.
      attemptMs: selection ? timeoutMs : definition.attemptMs * (effort ? REASONING_BUDGET : 1),
      ...(effort ? { reasoning: effort } : {}),
      ...(selection ? { model: selection } : {}),
      signal: input.signal,
    });
    if (usage && input.stepId) await this.keepUsage(input.stepId, usage);
    if (reasoning && input.stepId) await this.keepThought(input.stepId, reasoning, modelName);
    const parsed = input.schema.safeParse(value);
    if (!parsed.success) throw new FastStageError("invalid");
    return { value: parsed.data, modelName, ...(reasoning ? { reasoning } : {}) };
  }

  /** Os tokens sao so para conferencia: se nao der para guardar, o passo segue. */
  private async keepUsage(stepId: string, usage: TokenUsage): Promise<void> {
    try {
      await this.options.thoughts?.recordUsage(stepId, usage);
    } catch (error) {
      console.error(`[requests] tokens do passo ${stepId} nao foram guardados`, error);
    }
  }

  /** O raciocinio e so para conferencia: se nao der para guardar, o passo segue. */
  private async keepThought(stepId: string, reasoning: string, model: string): Promise<void> {
    const text = reasoning.length > MAX_THOUGHT_CHARS ? `${reasoning.slice(0, MAX_THOUGHT_CHARS)}…` : reasoning;
    try {
      await this.options.thoughts?.recordThought(stepId, {
        text, at: (this.options.clock?.() ?? new Date()).toISOString(), model,
      });
    } catch (error) {
      console.error(`[requests] raciocinio do passo ${stepId} nao foi guardado`, error);
    }
  }
}

/** O pedido e a tela de onde ele veio: a parte variavel da entrada de todo agente do chat. */
export function describeRequest(
  prompt: string,
  expected: string | undefined,
  context?: RequestScreenContext,
): string {
  return [
    ...(expected ? [`Quantidade (dica): ${expected}`, ""] : []),
    "Pedido:",
    prompt,
    ...(context ? ["", `Tela do usuário: ${context.screen}${context.entityId ? ` (${context.entityId})` : ""}`] : []),
  ].join("\n");
}

const LOOKUP_ROWS = 50;
const LOOKUP_CHARS = 8000;

/**
 * O que o agente de escrita recebe: o pedido, a tela e a lista curta do que ja existe, por tipo (e, na segunda
 * rodada, o resultado da consulta que ele pediu). Quem escolhe o que alterar dentro da lista e ele.
 */
export function describeEntityRequest(
  prompt: string,
  context: RequestScreenContext | undefined,
  candidates: readonly EditCandidate[],
  lookup?: Pick<RequestQueryResult, "columns" | "rows">,
): string {
  // Os horarios vao no fuso do usuario, como o agente os devolve: em UTC ele erra a conta de "as 21h".
  const local = (instant: string) => isoNow(new Date(instant));
  const of = (kind: EditCandidate["kind"]) => candidates
    .filter((candidate) => candidate.kind === kind)
    .map(({ kind: _kind, startedAt, estimatedFinishAt, ...rest }) => ({
      ...rest,
      ...(startedAt ? { startedAt: local(startedAt) } : {}),
      ...(estimatedFinishAt ? { estimatedFinishAt: local(estimatedFinishAt) } : {}),
    }));
  return [
    describeRequest(prompt, undefined, context),
    "",
    "Candidatos (JSON):",
    JSON.stringify({ tasks: of("task"), artifacts: of("artifact"), series: of("recurrence") }),
    ...(lookup
      ? ["", "Resultado da consulta (JSON):", JSON.stringify({
        columns: lookup.columns, rows: lookup.rows.slice(0, LOOKUP_ROWS),
      }).slice(0, LOOKUP_CHARS)]
      : []),
  ].join("\n");
}

/** Edicao pela tela de detalhe: o pedido e o retrato completo do unico alvo. Nada mais entra no prompt. */
export function describeTargetedEdit(prompt: string, target: EditTarget): string {
  return [
    "Pedido:",
    prompt,
    "",
    "Alvo (JSON):",
    JSON.stringify({ id: target.id, ...target.snapshot }),
  ].join("\n");
}
