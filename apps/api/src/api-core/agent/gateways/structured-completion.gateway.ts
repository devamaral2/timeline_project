import type { ModelEffort, ModelProvider, ModelSelection } from "@repo/contracts";
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
  /**
   * O provedor, o modelo e o esforco que o usuario escolheu para o pedido. Com ela, a chamada vai a esse modelo, no
   * esforco dela (o `reasoning` nao vale); sem ela, ao modelo fixo do servidor.
   */
  model?: ModelSelection;
  /**
   * Pede a saida presa ao schema (`output_config.format` da Anthropic), em vez do schema escrito no prompt. So para
   * schemas pequenos e simples: o limite de campos com uniao de tipos da saida presa nao cabe nos agentes de escrita.
   * Os provedores que nao a tem seguem pelo prompt.
   */
  strictSchema?: boolean;
  signal?: AbortSignal;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface StructuredCompletionResult {
  value: unknown;
  modelName: string;
  /** O que o modelo pensou antes de responder. Ausente quando nao foi pedido ou o modelo nao o expoe. */
  reasoning?: string;
  /** Os tokens que a chamada gastou, quando o provedor os informa. */
  usage?: TokenUsage;
}

/** Tokens gastos numa ou mais chamadas ao modelo. */
export interface TokenUsage {
  input: number;
  output: number;
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

/**
 * O JSON de uma resposta em texto: o objeto inteiro, mesmo quando o modelo o cerca de crases ou de uma frase.
 * Lanca quando nao ha objeto ou ele nao fecha.
 */
export function jsonReply(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * O formato pedido por escrito, para o provedor em que a saida presa ao schema nao cabe: o schema vai no fim do
 * prompt de sistema e quem chama valida a resposta.
 */
export function withSchemaInstruction(system: string, schema: Record<string, unknown>): string {
  return [
    system,
    "",
    "# Formato da resposta",
    "Responda só com um objeto JSON, sem texto antes ou depois e sem cercas de código, que siga este JSON Schema:",
    JSON.stringify(schema),
  ].join("\n");
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
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function usageOf(payload: CompletionPayload): TokenUsage | undefined {
  const input = payload.usage?.prompt_tokens;
  const output = payload.usage?.completion_tokens;
  if (typeof input !== "number" && typeof output !== "number") return undefined;
  return { input: typeof input === "number" ? input : 0, output: typeof output === "number" ? output : 0 };
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

/** Os niveis do seletor na escala do OpenRouter: Maximo e o `xhigh`, o mais alto que ele traduz para todo modelo. */
const SELECTED_EFFORTS: Record<ModelEffort, "low" | "medium" | "high" | "xhigh"> = {
  low: "low", medium: "medium", high: "high", max: "xhigh",
};

/**
 * Quem atende a chamada: sem escolha no pedido, o modelo fixo do servidor (`fixed`); com ela, o gateway do provedor
 * escolhido. Um provedor sem chave neste ambiente nao tem gateway: a chamada falha em vez de trocar de modelo calada.
 */
export class SelectedModelCompletionGateway implements StructuredCompletionGateway {
  constructor(
    private readonly fixed: StructuredCompletionGateway,
    private readonly providers: Partial<Record<ModelProvider, StructuredCompletionGateway>>,
  ) {}

  complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult> {
    if (!input.model) return this.fixed.complete(input);
    const provider = this.providers[input.model.provider];
    if (!provider) throw new LlmUnavailableError(`O provedor ${input.model.provider} não está ligado neste ambiente.`);
    return provider.complete(input);
  }
}

export class OpenRouterStructuredCompletionGateway implements StructuredCompletionGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly request: typeof fetch = fetch,
    private readonly minRetryMs = MIN_RETRY_MS,
  ) {}

  /** O modelo da chamada: o que o usuario escolheu no OpenRouter ou, sem escolha, o fixo do servidor. */
  private modelOf(input: StructuredCompletionInput): string | undefined {
    return input.model?.provider === "openrouter" ? input.model.model : this.modelName;
  }

  async complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult> {
    if (!this.apiKey) throw new LlmUnavailableError("Missing OPENROUTER_API_KEY");
    if (!this.modelOf(input)) throw new LlmUnavailableError("Missing OPENROUTER_MODEL");

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
    const modelName = this.modelOf(input) as string;
    const selected = input.model?.provider === "openrouter" ? input.model : undefined;
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
          // quando quem chama o pede, para conferir o que o modelo pensou, ou no esforco que o usuario escolheu.
          reasoning: selected ? { effort: SELECTED_EFFORTS[selected.effort] }
            : input.reasoning ? { effort: input.reasoning } : { enabled: false },
          // A cauda de latencia do provedor pesa mais que o preco numa chamada de ~1 s.
          provider: { sort: "latency" },
          messages: [
            // O modelo escolhido pelo usuario pode nao ter saida estruturada (o OpenRouter ignora o parametro que o
            // modelo nao aceita): o formato vai tambem por escrito.
            { role: "system", content: selected ? withSchemaInstruction(input.system, input.schema) : input.system },
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
      const reasoning = input.reasoning || selected ? reasoningOf(message) : undefined;
      const usage = usageOf(payload);
      return {
        ok: true,
        result: {
          value: selected ? jsonReply(message.content) : JSON.parse(message.content),
          modelName, ...(reasoning ? { reasoning } : {}), ...(usage ? { usage } : {}),
        },
      };
    } catch {
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      return failure(timeout.aborted ? "timeout" : "invalid");
    }
  }
}
