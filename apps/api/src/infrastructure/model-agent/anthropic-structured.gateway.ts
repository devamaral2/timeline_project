import Anthropic from "@anthropic-ai/sdk";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../../api-core/agent/errors/agent.errors";
import {
  jsonReply, withSchemaInstruction, type StructuredCompletionGateway, type StructuredCompletionInput,
  type StructuredCompletionResult,
} from "../../api-core/agent/gateways/structured-completion.gateway";
import { EFFORTS, FALLBACK_BETA, hasServerFallback } from "./anthropic-provider";

const MAX_TOKENS = 16_000;

/**
 * A chamada estruturada dos agentes do pedido no modelo da Anthropic que o usuario escolheu, no esforco dele.
 *
 * O schema vai escrito no prompt, e nao em `output_config.format`: a saida presa ao schema aceita no maximo 16
 * campos com uniao de tipos por pedido, e os agentes de escrita e de edicao tem dezenas de campos que podem vir
 * `null`. Quem chama valida a resposta contra o schema, como ja faz com o OpenRouter.
 */
export class AnthropicStructuredCompletionGateway implements StructuredCompletionGateway {
  private readonly client: Pick<Anthropic, "beta">;

  constructor(apiKey: string, client?: Pick<Anthropic, "beta">) {
    this.client = client ?? new Anthropic({ apiKey });
  }

  async complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult> {
    const selection = input.model;
    if (selection?.provider !== "anthropic") throw new LlmUnavailableError("A chamada à Anthropic exige um modelo dela.");
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    const fallback = hasServerFallback(selection.model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: selection.model,
        max_tokens: MAX_TOKENS,
        system: withSchemaInstruction(input.system, input.schema),
        messages: [{ role: "user", content: input.user }],
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: EFFORTS[selection.effort] },
        ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      }, { signal, maxRetries: 1 });
    } catch (error) {
      // Cancelar nao e falha do provedor: quem pediu parou de esperar.
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      throw new FastStageError(
        timeout.aborted ? "timeout" : "provider", error instanceof Anthropic.APIError ? error.status : undefined,
      );
    }

    // Recusa ou resposta cortada: o texto nao e o JSON pedido.
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new FastStageError("invalid");
    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    let value: unknown;
    try {
      value = jsonReply(text);
    } catch {
      throw new FastStageError("invalid");
    }
    const reasoning = response.content
      .flatMap((block) => (block.type === "thinking" && block.thinking.trim() ? [block.thinking.trim()] : []))
      .join("\n\n");
    const usage = response.usage;
    return {
      value,
      modelName: response.model,
      ...(reasoning ? { reasoning } : {}),
      usage: {
        input: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        output: usage.output_tokens ?? 0,
      },
    };
  }
}
