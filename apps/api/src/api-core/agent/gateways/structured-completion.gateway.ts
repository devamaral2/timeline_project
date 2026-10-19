import { z } from "zod";
import { getServerEnv } from "../../../config/env";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../errors/agent.errors";

export interface StructuredCompletionInput {
  stage: "planner" | "specialist";
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema da resposta. */
  schema: Record<string, unknown>;
  /** Orcamento da etapa: estourou, a chamada falha em vez de esperar. */
  timeoutMs: number;
  /** Teto da primeira tentativa; o que sobrar do orcamento fica para a segunda. Padrao: 60% do orcamento. */
  attemptMs?: number;
  signal?: AbortSignal;
}

/** Uma chamada ao modelo com saida estruturada e sem ferramentas: o oposto do loop do agente. */
export interface StructuredCompletionGateway {
  complete(input: StructuredCompletionInput): Promise<{ value: unknown; modelName: string }>;
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

interface CompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenRouterStructuredCompletionGateway implements StructuredCompletionGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly request: typeof fetch = fetch,
    private readonly minRetryMs = MIN_RETRY_MS,
  ) {}

  async complete(input: StructuredCompletionInput): Promise<{ value: unknown; modelName: string }> {
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
    | { ok: true; result: { value: unknown; modelName: string } }
    | { ok: false; reason: "timeout" | "provider" | "invalid"; error: FastStageError }
  > {
    const modelName = this.modelName as string;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    const failure = (reason: "timeout" | "provider" | "invalid", status?: number) =>
      ({ ok: false as const, reason, error: new FastStageError(input.stage, reason, status) });

    let response: Response;
    try {
      response = await this.request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: modelName,
          temperature: 0,
          // Extracao curta: o raciocinio do modelo custa 1-3 s por chamada e nao melhora o resultado.
          reasoning: { enabled: false },
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
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty content");
      return { ok: true, result: { value: JSON.parse(content), modelName } };
    } catch {
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      return failure(timeout.aborted ? "timeout" : "invalid");
    }
  }
}
