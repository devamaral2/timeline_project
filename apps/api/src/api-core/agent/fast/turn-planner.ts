import type { AgentScreenContext } from "@repo/contracts";
import { dayKeyOf } from "@repo/timeline";
import { z } from "zod";
import { agentsConfig, fill, promptsConfig } from "../config/agent-config";
import { jsonSchemaOf, type StructuredCompletionGateway } from "../gateways/structured-completion.gateway";
import { describeContext, formatNow } from "../services/agent-prompt-builder.service";
import { isoNow } from "./now-iso";

const { fast } = agentsConfig;
const TIME_ZONE = promptsConfig.timeZone;
const EVENT_SKILLS = new Set([
  "save_routine_event", "save_meal_event", "save_training_event", "save_sleep_event", "finish_event",
]);

/** Uma escrita que um especialista preenche. */
export interface PlannedOperation {
  /** Nome curto, unico no plano. */
  ref: string;
  skill: string;
  mode: "create" | "update";
  /** O trecho do pedido que cabe a esta operacao. */
  span: string;
  /** Dia do evento (AAAA-MM-DD, fuso do usuario). Ausente para tarefa e nota. */
  date?: string;
  /** Operacao anterior a que esta nota pertence. */
  linkTo?: string;
}

export type TurnPlan =
  | { kind: "write"; operations: PlannedOperation[] }
  | { kind: "clarify"; question: string }
  /** O fluxo rapido nao cobre o pedido: segue o roteador e o agente de sempre. */
  | { kind: "legacy"; reason: "read" | "other" | "invalid" };

const planSchema = z.object({
  intent: z.enum(["write", "read", "other", "clarify"]),
  clarification: z.string().nullable(),
  operations: z.array(z.object({
    ref: z.string().min(1).max(12),
    skill: z.enum(fast.skills as [string, ...string[]]),
    mode: z.enum(["create", "update"]),
    span: z.string().min(1),
    date: z.string().nullable(),
    linkTo: z.string().nullable(),
  })).max(fast.maxOperations),
});

export interface PlanRequest {
  text: string;
  context?: AgentScreenContext;
  now: Date;
  signal?: AbortSignal;
}

/** Uma chamada estruturada que divide o pedido em operacoes. Nunca grava nem consulta. */
export class TurnPlanner {
  constructor(private readonly gateway: StructuredCompletionGateway) {}

  async plan(request: PlanRequest): Promise<TurnPlan> {
    const values = { now: formatNow(request.now), nowIso: isoNow(request.now), timeZone: TIME_ZONE };
    const { value } = await this.gateway.complete({
      stage: "planner",
      system: promptsConfig.fast.planner.map((line) => fill(line, values)).join("\n"),
      user: [describeContext(request.context), "", "Pedido:", request.text].join("\n"),
      schemaName: "turn_plan",
      schema: jsonSchemaOf(planSchema),
      timeoutMs: fast.plannerTimeoutMs,
      attemptMs: fast.plannerAttemptMs,
      signal: request.signal,
    });
    return normalizePlan(value, request.now);
  }
}

/**
 * O modelo pode errar a forma ou propor algo que o fluxo rapido nao cobre. Em qualquer duvida o
 * plano vira `legacy`: o pedido segue o caminho conhecido em vez de gravar o que nao entendemos.
 */
export function normalizePlan(value: unknown, now: Date): TurnPlan {
  const parsed = planSchema.safeParse(value);
  if (!parsed.success) return { kind: "legacy", reason: "invalid" };
  const { intent, clarification, operations } = parsed.data;

  if (intent === "read") return { kind: "legacy", reason: "read" };
  if (intent === "other") return { kind: "legacy", reason: "other" };
  if (intent === "clarify") {
    return clarification?.trim()
      ? { kind: "clarify", question: clarification.trim() }
      : { kind: "legacy", reason: "invalid" };
  }
  if (operations.length === 0) return { kind: "legacy", reason: "other" };

  const today = dayKeyOf(now, TIME_ZONE);
  const seen = new Set<string>();
  const planned: PlannedOperation[] = [];
  for (const operation of operations) {
    const isEvent = EVENT_SKILLS.has(operation.skill);
    if (seen.has(operation.ref)) return { kind: "legacy", reason: "invalid" };
    // Alterar tarefa ou nota exige achar o registro: isso fica com o agente que consulta.
    if (operation.mode === "update" && !isEvent) return { kind: "legacy", reason: "other" };
    const mode = operation.skill === "finish_event" ? "update" : operation.mode;
    const date = operation.date && /^\d{4}-\d{2}-\d{2}$/.test(operation.date) ? operation.date : undefined;
    // `linkTo` so vale para nota e para uma operacao que ja veio antes.
    const linkTo = operation.skill === "save_note" && operation.linkTo && seen.has(operation.linkTo)
      ? operation.linkTo
      : undefined;
    planned.push({
      ref: operation.ref, skill: operation.skill, mode, span: operation.span,
      ...(isEvent ? { date: date ?? today } : {}),
      ...(linkTo ? { linkTo } : {}),
    });
    seen.add(operation.ref);
  }
  return { kind: "write", operations: planned };
}
