import type { RequestQueryResult, RequestScreenContext } from "@repo/contracts";
import type { z } from "zod";
import { FastStageError } from "../agent/errors/agent.errors";
import {
  jsonSchemaOf, type ReasoningEffort, type StructuredCompletionGateway,
} from "../agent/gateways/structured-completion.gateway";
import { formatNow, isoNow, TIME_ZONE } from "../agent/time";
import type { EditCandidate } from "./request-candidates";
import { loadAgentDefinition, renderAgentPrompt } from "./request-config";
import type { EditTarget, RequestStore } from "./request-store";

/** Quanto do raciocinio de uma chamada fica guardado. */
const MAX_THOUGHT_CHARS = 12_000;
/** Pensando, a chamada leva 1-3 s a mais: o orcamento do agente, medido sem raciocinio, dobra. */
const REASONING_BUDGET = 2;

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
  /** A chamada pensa antes de responder, no esforco do runner. Sem isto, nao pensa: so o fallback escolhido pede. */
  think?: boolean;
}

export interface RequestAgentRunnerOptions {
  /** Esforco de raciocinio das chamadas que pedem para pensar (`think`). Sem valor, nenhuma pensa. */
  reasoning?: ReasoningEffort;
  /** Onde o raciocinio de cada chamada fica guardado. */
  thoughts?: Pick<RequestStore, "recordThought">;
  clock?: () => Date;
}

/**
 * Uma chamada estruturada por agente, sem ferramentas: o `.md` e o prompt de sistema, o schema Zod e o
 * contrato da saida. Resposta fora do schema falha o passo; nao ha segunda interpretacao.
 *
 * A chamada que pede `think`, com `reasoning` configurado, pensa antes de responder e o que o modelo pensou vai
 * para o passo assim que a chamada volta, antes de a saida ser validada: o raciocinio de uma resposta recusada e
 * o que mais interessa conferir. As outras nao pensam: sao extracoes curtas, e pensar custa 1-3 s por chamada.
 */
export class RequestAgentRunner {
  constructor(
    private readonly gateway: StructuredCompletionGateway,
    private readonly options: RequestAgentRunnerOptions = {},
  ) {}

  async run<T>(input: AgentRunInput<T>): Promise<{ value: T; modelName: string; reasoning?: string }> {
    const definition = loadAgentDefinition(input.agent);
    const effort = input.think ? this.options.reasoning : undefined;
    const budget = effort ? REASONING_BUDGET : 1;
    const { value, modelName, reasoning } = await this.gateway.complete({
      system: renderAgentPrompt(definition, {
        now: formatNow(input.now),
        nowIso: isoNow(input.now),
        timeZone: TIME_ZONE,
      }),
      user: input.user,
      schemaName: definition.name.replace(/-/g, "_"),
      schema: jsonSchemaOf(input.schema),
      timeoutMs: definition.timeoutMs * budget,
      attemptMs: definition.attemptMs * budget,
      ...(effort ? { reasoning: effort } : {}),
      signal: input.signal,
    });
    if (reasoning && input.stepId) await this.keepThought(input.stepId, reasoning, modelName);
    const parsed = input.schema.safeParse(value);
    if (!parsed.success) throw new FastStageError("invalid");
    return { value: parsed.data, modelName, ...(reasoning ? { reasoning } : {}) };
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

/** A parte variavel que todos os agentes de criacao recebem. */
export function describeRequest(
  prompt: string,
  expected: string | undefined,
  context?: RequestScreenContext,
  focus?: string,
): string {
  return [
    ...(expected ? [`Quantidade (dica): ${expected}`, ""] : []),
    ...(focus ? [`Foco (dado pelo orquestrador): ${focus}`, ""] : []),
    "Pedido:",
    prompt,
    ...(context ? ["", `Tela do usuário: ${context.screen}${context.entityId ? ` (${context.entityId})` : ""}`] : []),
  ].join("\n");
}

const LOOKUP_ROWS = 50;
const LOOKUP_CHARS = 8000;

/** Os candidatos de edicao (e, na segunda rodada, o resultado da consulta que o agente pediu). */
export function describeEditRequest(
  prompt: string,
  expected: string,
  context: RequestScreenContext | undefined,
  candidates: readonly EditCandidate[],
  lookup?: Pick<RequestQueryResult, "columns" | "rows">,
  focus?: string,
): string {
  return [
    describeRequest(prompt, expected, context, focus),
    "",
    "Candidatos (JSON):",
    JSON.stringify(candidates.map(({ kind: _kind, ...rest }) => rest)),
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
