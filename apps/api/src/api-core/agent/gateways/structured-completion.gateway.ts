import { z } from "zod";
import { getServerEnv } from "../../../config/env";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../errors/agent.errors";

export interface StructuredCompletionInput {
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema da resposta. */
  schema: Record<string, unknown>;
  /** Orcamento da etapa: estourou, a chamada falha em vez de esperar. */
  timeoutMs: number;
  /** Teto da primeira tentativa; o que sobrar do orcamento fica para a segunda. Padrao: 60% do orcamento. */
  attemptMs?: number;
  /**
   * Esforco de raciocinio pedido ao modelo. Sem valor, o raciocinio fica desligado: custa 1-3 s por chamada.
   * Com valor, o texto do raciocinio volta em `reasoning` quando o modelo o entrega.
   */
  reasoning?: ReasoningEffort;
  signal?: AbortSignal;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface StructuredCompletionResult {
  value: unknown;
  modelName: string;
  /** O que o modelo pensou antes de responder. Ausente quando nao foi pedido ou o modelo nao o expoe. */
  reasoning?: string;
}

/** Uma chamada ao modelo com saida estruturada e sem ferramentas: o oposto do loop do agente. */
export interface StructuredCompletionGateway {
  complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult>;
}

/** JSON Schema de um schema Zod, sem o `$schema` que alguns provedores recusam. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Parte do orcamento da etapa dada a primeira tentativa; o resto fica para a segunda. */
const FIRST_ATTEMPT_SHARE = 0.6;
/** Menos que isto nao da para uma segunda chamada: falhar logo e melhor que esperar. */
const MIN_RETRY_MS = 500;

interface CompletionMessage {
  content?: string;
  reasoning?: string | null;
  /** Blocos do raciocinio: texto, resumo (modelos que nao entregam o bruto) ou cifrado, que nao se le. */
  reasoning_details?: Array<{ type?: string; text?: string | null; summary?: string | null }> | null;
}

interface CompletionPayload {
  choices?: Array<{ message?: CompletionMessage }>;
}

/** O raciocinio como texto: o campo pronto ou, na falta dele, os blocos legiveis. */
function reasoningOf(message: CompletionMessage | undefined): string | undefined {
  const whole = typeof message?.reasoning === "string" ? message.reasoning.trim() : "";
  if (whole) return whole;
  const parts = (Array.isArray(message?.reasoning_details) ? message.reasoning_details : [])
    .map((detail) => (typeof detail?.text === "string" ? detail.text : typeof detail?.summary === "string" ? detail.summary : "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export class OpenRouterStructuredCompletionGateway implements StructuredCompletionGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly request: typeof fetch = fetch,
    private readonly minRetryMs = MIN_RETRY_MS,
  ) {}

  async complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult> {
    if (!this.apiKey) throw new LlmUnavailableError("Missing OPENROUTER_API_KEY");
    if (!this.modelName) throw new LlmUnavailableError("Missing OPENROUTER_MODEL");

    // Uma chamada que trava (cauda do provedor, medida em ~3% das chamadas) custa o orcamento
    // inteiro. Uma segunda tentativa com o que sobrou resolve quase sempre, porque a chamada
    // normal leva ~1 s: o orcamento total da etapa continua o mesmo.
    const deadline = performance.now() + input.timeoutMs;
    const first = await this.attempt(input, Math.round(input.attemptMs ?? input.timeoutMs * FIRST_ATTEMPT_SHARE));
    if (first.ok) return first.result;
    const remaining = deadline - performance.now();
    if (first.reason !== "timeout" || remaining < this.minRetryMs) throw first.error;
    const second = await this.attempt(input, Math.round(remaining));
    if (second.ok) return second.result;
    throw second.error;
  }

  private async attempt(input: StructuredCompletionInput, timeoutMs: number): Promise<
    | { ok: true; result: StructuredCompletionResult }
    | { ok: false; reason: "timeout" | "provider" | "invalid"; error: FastStageError }
  > {
    const modelName = this.modelName as string;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    const failure = (reason: "timeout" | "provider" | "invalid", status?: number) =>
      ({ ok: false as const, reason, error: new FastStageError(reason, status) });

    let response: Response;
    try {
      response = await this.request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: modelName,
          temperature: 0,
          // Extracao curta: o raciocinio do modelo custa 1-3 s por chamada e nao melhora o resultado. So liga
          // quando quem chama o pede, para conferir o que o modelo pensou.
          reasoning: input.reasoning ? { effort: input.reasoning } : { enabled: false },
          // A cauda de latencia do provedor pesa mais que o preco numa chamada de ~1 s.
          provider: { sort: "latency" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: input.schemaName, strict: false, schema: input.schema },
          },
        }),
        signal,
      });
    } catch {
      // Cancelar nao e falha do provedor: quem pediu parou de esperar.
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      return failure(timeout.aborted ? "timeout" : "provider");
    }

    if (!response.ok) return failure("provider", response.status);

    try {
      const payload = (await response.json()) as CompletionPayload;
      const message = payload.choices?.[0]?.message;
      if (!message?.content) throw new Error("empty content");
      const reasoning = input.reasoning ? reasoningOf(message) : undefined;
      return { ok: true, result: { value: JSON.parse(message.content), modelName, ...(reasoning ? { reasoning } : {}) } };
    } catch {
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      return failure(timeout.aborted ? "timeout" : "invalid");
    }
  }
}
