import OpenAI from "openai";
import type { ModelEffort } from "@repo/contracts";
import { toolCallOf, type ModelConversation, type ModelConversationInput, type ModelProviderClient, type ModelStep } from "./model-agent";

const BASE_URL = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 16_000;

/** Os niveis do seletor na escala do OpenRouter: Maximo e o `xhigh`, o mais alto que ele traduz para todo modelo. */
const EFFORTS: Record<ModelEffort, "low" | "medium" | "high" | "xhigh"> = { low: "low", medium: "medium", high: "high", max: "xhigh" };

type ChatClient = Pick<OpenAI, "chat">;

/** A mensagem do OpenRouter traz o raciocinio fora do formato da OpenAI. */
interface RouterMessage extends OpenAI.Chat.ChatCompletionMessage {
  reasoning?: string | null;
  /** Blocos do raciocinio: texto, resumo ou cifrado. Voltam inteiros na proxima ida, para o modelo seguir a linha. */
  reasoning_details?: Array<{ type?: string; text?: string | null; summary?: string | null }> | null;
}

/**
 * O OpenRouter pela API compativel com a da OpenAI (ADR 0019), com o SDK da OpenAI apontado para ele: as mesmas
 * repeticoes e erros tipados. Um modelo de qualquer laboratorio, com as ferramentas da agenda e o raciocinio que o
 * modelo expoe.
 */
export class OpenRouterProvider implements ModelProviderClient {
  readonly name = "OpenRouter";
  private readonly client: ChatClient;

  constructor(apiKey: string, client?: ChatClient) {
    this.client = client ?? new OpenAI({ apiKey, baseURL: BASE_URL, defaultHeaders: { "X-Title": "Braid" } });
  }

  open(input: ModelConversationInput): ModelConversation {
    const client = this.client;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: input.system },
      ...input.history.map((message): OpenAI.Chat.ChatCompletionMessageParam => ({ role: message.role, content: message.text })),
      { role: "user", content: `${input.context}\n\n${input.text}` },
    ];
    const tools = input.tools.map((tool): OpenAI.Chat.ChatCompletionTool => ({
      type: "function",
      function: { name: tool.name, ...(tool.description ? { description: tool.description } : {}), parameters: tool.inputSchema },
    }));

    return {
      async next(signal): Promise<ModelStep> {
        const body = {
          model: input.model,
          max_tokens: MAX_TOKENS,
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          reasoning: { effort: EFFORTS[input.effort] },
          usage: { include: true },
        };
        const response = await client.chat.completions.create(
          body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, { signal });
        const choice = response.choices[0];
        const message = choice?.message as RouterMessage | undefined;
        const toolCalls = (message?.tool_calls ?? []).flatMap((call) => (call.type === "function" ? [call] : []));
        if (message) {
          messages.push({
            role: "assistant",
            content: message.content ?? null,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}),
          } as OpenAI.Chat.ChatCompletionAssistantMessageParam);
        }
        const calls = toolCalls.map((call) => toolCallOf(call.id, call.function.name, call.function.arguments));
        const finish = choice?.finish_reason;
        const refusal = message?.refusal?.trim() ?? "";
        return {
          model: response.model,
          usage: {
            input: response.usage?.prompt_tokens ?? 0,
            output: response.usage?.completion_tokens ?? 0,
            cacheRead: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          },
          thoughts: reasoningOf(message),
          text: (message?.content ?? "").trim() || refusal,
          calls,
          stop: finish === "content_filter" || (refusal && calls.length === 0) ? "refused"
            : finish === "length" ? "truncated"
              : calls.length > 0 ? "tools"
                : "done",
        };
      },
      answer(results) {
        for (const { call, outcome } of results) {
          messages.push({ role: "tool", tool_call_id: call.id, content: outcome.isError ? `Erro: ${outcome.content}` : outcome.content });
        }
      },
    };
  }
}

/** O raciocinio legivel: o campo pronto ou, na falta dele, os blocos de texto e de resumo. */
function reasoningOf(message: RouterMessage | undefined): string[] {
  const whole = typeof message?.reasoning === "string" ? message.reasoning.trim() : "";
  if (whole) return [whole];
  const parts = (message?.reasoning_details ?? [])
    .map((detail) => (typeof detail?.text === "string" ? detail.text : typeof detail?.summary === "string" ? detail.summary : "").trim())
    .filter(Boolean);
  return parts.length > 0 ? [parts.join("\n\n")] : [];
}
