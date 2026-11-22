import Anthropic from "@anthropic-ai/sdk";
import type { ModelEffort } from "@repo/contracts";
import type { ModelConversation, ModelConversationInput, ModelProviderClient, ModelStep } from "./model-agent";

const MAX_TOKENS = 16_000;
/** Na recusa por politica, a API refaz a chamada noutro modelo dentro da mesma chamada. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Os niveis do seletor na escala da Anthropic: Maximo e o `max` da API. */
const EFFORTS: Record<ModelEffort, "low" | "medium" | "high" | "max"> = { low: "low", medium: "medium", high: "high", max: "max" };

/** O Haiku nao tem fallback do servidor: com ele, a recusa volta como veio. */
function hasServerFallback(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

/**
 * A API da Anthropic pelo SDK oficial (ADR 0019): raciocinio adaptativo com resumo (o "Pensou" do chat), cache do
 * prompt e o fallback do servidor na recusa por politica.
 */
export class AnthropicProvider implements ModelProviderClient {
  readonly name = "Anthropic";
  private readonly client: Pick<Anthropic, "beta">;

  constructor(apiKey: string, client?: Pick<Anthropic, "beta">) {
    this.client = client ?? new Anthropic({ apiKey });
  }

  open(input: ModelConversationInput): ModelConversation {
    const client = this.client;
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...input.history.map((message): Anthropic.Beta.BetaMessageParam => ({ role: message.role, content: message.text })),
      { role: "user", content: [{ type: "text", text: input.context }, { type: "text", text: input.text }] },
    ];
    const tools = input.tools.map((tool): Anthropic.Beta.BetaTool => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const fallback = hasServerFallback(input.model);

    return {
      async next(signal): Promise<ModelStep> {
        const response = await client.beta.messages.create({
          model: input.model,
          max_tokens: MAX_TOKENS,
          system: input.system,
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: EFFORTS[input.effort] },
          cache_control: { type: "ephemeral" },
          ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        }, { signal });

        // A resposta volta inteira na proxima ida: o raciocinio assinado vai junto das ferramentas pedidas.
        if (response.stop_reason !== "refusal") messages.push({ role: "assistant", content: response.content });
        const usage = response.usage;
        return {
          model: response.model,
          usage: {
            input: usage.input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            cacheWrite: usage.cache_creation_input_tokens ?? 0,
          },
          thoughts: response.content.flatMap((block) => (block.type === "thinking" ? [block.thinking] : [])),
          text: response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim(),
          calls: response.content.flatMap((block) => (block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : [])),
          stop: response.stop_reason === "refusal" ? "refused"
            : response.stop_reason === "pause_turn" ? "paused"
              : response.stop_reason === "max_tokens" ? "truncated"
                : response.stop_reason === "tool_use" ? "tools"
                  : "done",
        };
      },
      answer(results) {
        // Todos os resultados numa mensagem so: separados, o modelo aprende a nao pedir ferramentas em paralelo.
        messages.push({
          role: "user",
          content: results.map(({ call, outcome }): Anthropic.Beta.BetaToolResultBlockParam => ({
            type: "tool_result", tool_use_id: call.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}),
          })),
        });
      },
    };
  }
}
