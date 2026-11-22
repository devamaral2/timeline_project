import OpenAI from "openai";
import type { ModelEffort } from "@repo/contracts";
import { toolCallOf, type ModelConversation, type ModelConversationInput, type ModelProviderClient, type ModelStep } from "./model-agent";

const MAX_OUTPUT_TOKENS = 16_000;

/** Os niveis do seletor na escala da OpenAI: Maximo e o `max` dos modelos GPT-6. */
const EFFORTS: Record<ModelEffort, "low" | "medium" | "high" | "max"> = { low: "low", medium: "medium", high: "high", max: "max" };

type ResponsesClient = Pick<OpenAI, "responses">;

/**
 * A API da OpenAI pela Responses API (ADR 0019), a unica em que os modelos GPT-6 usam ferramentas. Sem guardar nada
 * na OpenAI (`store: false`): o raciocinio cifrado de cada ida volta na seguinte, junto das ferramentas pedidas.
 * O resumo do raciocinio (o "Pensou" do chat) pode exigir a organizacao verificada; recusado, o turno segue sem ele.
 */
export class OpenAIProvider implements ModelProviderClient {
  readonly name = "OpenAI";
  private readonly client: ResponsesClient;
  /** Uma recusa do resumo vale para o processo: as proximas chamadas nem pedem. */
  private summaries = true;

  constructor(apiKey: string, client?: ResponsesClient) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  open(input: ModelConversationInput): ModelConversation {
    const items: OpenAI.Responses.ResponseInputItem[] = [
      ...input.history.map((message): OpenAI.Responses.ResponseInputItem => ({ role: message.role, content: message.text })),
      {
        role: "user",
        content: [{ type: "input_text", text: input.context }, { type: "input_text", text: input.text }],
      },
    ];
    const tools = input.tools.map((tool): OpenAI.Responses.FunctionTool => ({
      type: "function",
      name: tool.name,
      description: tool.description ?? null,
      parameters: tool.inputSchema,
      // Os schemas do MCP tem campos opcionais; o modo estrito exigiria todos.
      strict: false,
    }));

    const create = (summary: boolean, signal: AbortSignal) => this.client.responses.create({
      model: input.model,
      instructions: input.system,
      input: items,
      ...(tools.length > 0 ? { tools } : {}),
      reasoning: { effort: EFFORTS[input.effort], ...(summary ? { summary: "auto" as const } : {}) },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
      include: ["reasoning.encrypted_content"],
    }, { signal });

    return {
      next: async (signal): Promise<ModelStep> => {
        let response: OpenAI.Responses.Response;
        try {
          response = await create(this.summaries, signal);
        } catch (error) {
          if (!this.summaries || !isSummaryRefusal(error)) throw error;
          this.summaries = false;
          response = await create(false, signal);
        }

        items.push(...(response.output as unknown as OpenAI.Responses.ResponseInputItem[]));
        const refusal = response.output
          .flatMap((item) => (item.type === "message" ? item.content : []))
          .map((part) => (part.type === "refusal" ? part.refusal : ""))
          .join("")
          .trim();
        const reason = response.incomplete_details?.reason;
        const calls = response.output.flatMap((item) => (item.type === "function_call" ? [toolCallOf(item.call_id, item.name, item.arguments)] : []));
        return {
          model: response.model,
          usage: {
            input: response.usage?.input_tokens ?? 0,
            output: response.usage?.output_tokens ?? 0,
            cacheRead: response.usage?.input_tokens_details?.cached_tokens ?? 0,
            cacheWrite: response.usage?.input_tokens_details?.cache_write_tokens ?? 0,
          },
          thoughts: response.output.flatMap((item) => (item.type === "reasoning" ? [item.summary.map((part) => part.text).join("\n\n")] : [])),
          text: refusal && !response.output_text.trim() ? refusal : response.output_text.trim(),
          calls,
          stop: (refusal && calls.length === 0) || reason === "content_filter" ? "refused"
            : reason === "max_output_tokens" ? "truncated"
              : calls.length > 0 ? "tools"
                : "done",
        };
      },
      answer(results) {
        for (const { call, outcome } of results) {
          // A Responses API nao tem marca de erro no resultado: o texto diz que falhou.
          items.push({ type: "function_call_output", call_id: call.id, output: outcome.isError ? `Erro: ${outcome.content}` : outcome.content });
        }
      },
    };
  }
}

/** 400 por causa do resumo do raciocinio (organizacao nao verificada, ou modelo que nao resume). */
function isSummaryRefusal(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError) || error.status !== 400) return false;
  const message = error.message.toLowerCase();
  return message.includes("summary") || message.includes("verif");
}
