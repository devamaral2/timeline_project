import type { AgentScreenContext } from "@repo/contracts";
import { z } from "zod";
import { agentsConfig, fill, promptsConfig } from "../config/agent-config";
import type { DayContextEvent } from "../day-context.query";
import { FastStageError } from "../errors/agent.errors";
import { jsonSchemaOf, type StructuredCompletionGateway } from "../gateways/structured-completion.gateway";
import { describeContext, formatNow } from "../services/agent-prompt-builder.service";
import { isoNow } from "./now-iso";
import type { AgentSkill } from "../skills/agent-skill";
import type { PlannedOperation } from "./turn-planner";

export interface SpecialistRequest {
  operation: PlannedOperation;
  skill: AgentSkill;
  /** O pedido inteiro, com a conversa: o trecho da operacao sozinho perde referencias. */
  request: string;
  context?: AgentScreenContext;
  now: Date;
  /** Eventos do dia da operacao. So entram para alterar: criar nao precisa. */
  dayEvents?: readonly DayContextEvent[];
  signal?: AbortSignal;
}

export type SpecialistResult =
  | { kind: "command"; args: Record<string, unknown>; modelName: string }
  | { kind: "clarify"; question: string; modelName: string };

const answerSchema = z.object({
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  args: z.record(z.string(), z.unknown()).nullable().optional(),
  clarification: z.string().nullable().optional(),
});

/**
 * Os horarios sao campos PROPRIOS da resposta, antes dos argumentos. Como opcionais dentro dos
 * argumentos (onde a descricao da skill diz "omita para agora") o modelo os deixava de fora mesmo
 * quando o pedido dizia "as 13h" ou "ha uma hora": medido em scripts/evaluate-fast-pipeline.ts.
 */
const eventTimes = {
  startedAt: z.string().nullable().describe(
    "Quando o evento começou, ISO-8601 com fuso -03:00, calculado do pedido ('às 13h', 'há uma hora', 'ontem às 20h'). null só se o pedido não diz quando.",
  ),
  finishedAt: z.string().nullable().describe("Quando terminou, ISO-8601 com fuso. null se o pedido não diz."),
};

/**
 * Preenche os argumentos de UMA skill numa unica chamada estruturada, sem ferramentas. O servidor
 * ja leu o dia; o modelo so extrai. A validacao final e a mesma do caminho de sempre.
 */
export class EntitySpecialist {
  private readonly schemas = new Map<string, Record<string, unknown>>();

  constructor(private readonly gateway: StructuredCompletionGateway) {}

  async fill(request: SpecialistRequest): Promise<SpecialistResult> {
    const { operation, skill } = request;
    const { value, modelName } = await this.gateway.complete({
      stage: "specialist",
      system: promptsConfig.fast.specialist
        .map((line) => fill(line, {
          now: formatNow(request.now), nowIso: isoNow(request.now), timeZone: promptsConfig.timeZone, skill: skill.name, skillInstructions: skill.instructions,
        }))
        .join("\n"),
      user: this.describe(request),
      schemaName: `${skill.name}_args`,
      schema: this.schemaFor(skill),
      timeoutMs: agentsConfig.fast.specialistTimeoutMs,
      attemptMs: agentsConfig.fast.specialistAttemptMs,
      signal: request.signal,
    });

    const answer = answerSchema.safeParse(value);
    if (!answer.success) throw new FastStageError("specialist", "invalid");
    const question = answer.data.clarification?.trim();
    if (question) return { kind: "clarify", question, modelName };

    const args = answer.data.args ? stripNulls(answer.data.args) : undefined;
    if (!args) throw new FastStageError("specialist", "invalid");
    // O horario do envelope vale quando os argumentos nao o trazem.
    for (const field of timeFields(skill)) {
      const value = answer.data[field];
      if (value && args[field] === undefined) args[field] = value;
    }

    // Um fim igual ou anterior ao inicio e preenchimento do modelo, nao informacao do pedido.
    const start = typeof args.startedAt === "string" ? new Date(args.startedAt).getTime() : Number.NaN;
    const end = typeof args.finishedAt === "string" ? new Date(args.finishedAt).getTime() : Number.NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) delete args.finishedAt;

    if (operation.mode === "create") delete args.id;
    else if (operation.skill !== "save_note" && operation.skill !== "save_task") {
      const known = request.dayEvents?.some((event) => event.id === args.id);
      // Um id que nao esta no dia lido e id inventado: perguntar custa menos que alterar o evento errado.
      if (typeof args.id !== "string" || !known) {
        return { kind: "clarify", question: promptsConfig.fast.clarificationFallback, modelName };
      }
    }

    const checked = skill.parameters.strict().safeParse(args);
    if (!checked.success) throw new FastStageError("specialist", "invalid");
    return { kind: "command", args: checked.data as Record<string, unknown>, modelName };
  }

  private schemaFor(skill: AgentSkill): Record<string, unknown> {
    let schema = this.schemas.get(skill.name);
    if (!schema) {
      schema = jsonSchemaOf(z.object({
        ...Object.fromEntries(timeFields(skill).map((field) => [field, eventTimes[field]])),
        args: skill.parameters.nullable(),
        clarification: z.string().nullable(),
      }));
      this.schemas.set(skill.name, schema);
    }
    return schema;
  }

  private describe({ operation, request, context, dayEvents }: SpecialistRequest): string {
    return [
      `Operação: ${operation.mode === "create" ? "criar" : "alterar"}`,
      `Trecho do pedido: ${operation.span}`,
      ...(operation.date ? [`Dia da operação: ${operation.date}`] : []),
      "",
      "Pedido completo:",
      request,
      "",
      describeContext(context),
      ...(dayEvents && operation.date
        ? ["", `Eventos de ${operation.date} (JSON):`, JSON.stringify(dayEvents.map(summarize))]
        : []),
    ].join("\n");
  }
}

/** Os campos de horario que a skill aceita; so eventos os tem. */
function timeFields(skill: AgentSkill): Array<"startedAt" | "finishedAt"> {
  const fields = Object.keys(skill.parameters.shape);
  return (["startedAt", "finishedAt"] as const).filter((field) => fields.includes(field) && (skill.name !== "save_task"));
}

function summarize(event: DayContextEvent) {
  return { id: event.id, name: event.name, kind: event.kind, started_at: event.started_at, finished_at: event.finished_at };
}

/** Modelos preenchem o que nao se aplica com `null`; para o schema da skill isso e ausencia. */
function stripNulls(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue;
    result[key] = entry && typeof entry === "object" && !Array.isArray(entry)
      ? stripNulls(entry as Record<string, unknown>)
      : entry;
  }
  return result;
}
