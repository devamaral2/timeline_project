import type { AgentScreenContext } from "@repo/contracts";
import type { z } from "zod";
import { FastStageError } from "../agent/errors/agent.errors";
import { jsonSchemaOf, type StructuredCompletionGateway } from "../agent/gateways/structured-completion.gateway";
import { formatNow } from "../agent/time";
import { isoNow } from "../agent/time";
import { TIME_ZONE } from "../agent/time";
import type { EditCandidate } from "./process-candidates";
import { loadAgentDefinition, renderAgentPrompt } from "./process-config";
import type { EditTarget, QueryResult } from "./process-store";


export interface AgentRunInput<T> {
  /** Nome do `.md` do agente. */
  agent: string;
  now: Date;
  /** A parte variavel da entrada: pedido, dica de quantidade, contexto de tela. */
  user: string;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

/**
 * Uma chamada estruturada por agente, sem ferramentas: o `.md` e o prompt de sistema, o schema Zod e o
 * contrato da saida. Resposta fora do schema falha o passo; nao ha segunda interpretacao.
 */
export class ProcessAgentRunner {
  constructor(private readonly gateway: StructuredCompletionGateway) {}

  async run<T>(input: AgentRunInput<T>): Promise<{ value: T; modelName: string }> {
    const definition = loadAgentDefinition(input.agent);
    const { value, modelName } = await this.gateway.complete({
      stage: "process",
      system: renderAgentPrompt(definition, {
        now: formatNow(input.now),
        nowIso: isoNow(input.now),
        timeZone: TIME_ZONE,
      }),
      user: input.user,
      schemaName: definition.name.replace(/-/g, "_"),
      schema: jsonSchemaOf(input.schema),
      timeoutMs: definition.timeoutMs,
      attemptMs: definition.attemptMs,
      signal: input.signal,
    });
    const parsed = input.schema.safeParse(value);
    if (!parsed.success) throw new FastStageError("process", "invalid");
    return { value: parsed.data, modelName };
  }
}

/** A parte variavel que todos os agentes de criacao recebem. */
export function describeRequest(
  prompt: string,
  expected: string | undefined,
  context?: AgentScreenContext,
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
  context: AgentScreenContext | undefined,
  candidates: readonly EditCandidate[],
  lookup?: Pick<QueryResult, "columns" | "rows">,
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
