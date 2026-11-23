import OpenAI from "openai";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../../api-core/agent/errors/agent.errors";
import {
  jsonReply, type StructuredCompletionGateway, type StructuredCompletionInput, type StructuredCompletionResult,
} from "../../api-core/agent/gateways/structured-completion.gateway";
import { EFFORTS, isSummaryRefusal } from "./openai-provider";

const MAX_OUTPUT_TOKENS = 16_000;

type ResponsesClient = Pick<OpenAI, "responses">;

/**
 * A chamada estruturada dos agentes do pedido no modelo da OpenAI que o usuario escolheu, no esforco dele, pela
 * Responses API e sem guardar nada na OpenAI. O schema vai como formato da resposta sem o modo estrito, que
 * exigiria todo campo obrigatorio; quem chama valida a resposta contra o schema.
 */
export class OpenAIStructuredCompletionGateway implements StructuredCompletionGateway {
  private readonly client: ResponsesClient;
  /** Uma recusa do resumo do raciocinio vale para o processo: as proximas chamadas nem pedem. */
  private summaries = true;

  constructor(apiKey: string, client?: ResponsesClient) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async complete(input: StructuredCompletionInput): Promise<StructuredCompletionResult> {
    const selection = input.model;
    if (selection?.provider !== "openai") throw new LlmUnavailableError("A chamada à OpenAI exige um modelo dela.");
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    const create = (summary: boolean) => this.client.responses.create({
      model: selection.model,
      instructions: input.system,
      input: input.user,
      reasoning: { effort: EFFORTS[selection.effort], ...(summary ? { summary: "auto" as const } : {}) },
      text: { format: { type: "json_schema", name: input.schemaName, schema: input.schema, strict: false } },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    }, { signal, maxRetries: 1 });

    let response: OpenAI.Responses.Response;
    try {
      try {
        response = await create(this.summaries);
      } catch (error) {
        if (!this.summaries || !isSummaryRefusal(error)) throw error;
        this.summaries = false;
        response = await create(false);
      }
    } catch (error) {
      // Cancelar nao e falha do provedor: quem pediu parou de esperar.
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      throw new FastStageError(
        timeout.aborted ? "timeout" : "provider", error instanceof OpenAI.APIError ? error.status : undefined,
      );
    }

    const refused = response.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));
    // Recusa ou resposta cortada: o texto nao e o JSON pedido.
    if (refused || response.incomplete_details) throw new FastStageError("invalid");
    let value: unknown;
    try {
      value = jsonReply(response.output_text);
    } catch {
      throw new FastStageError("invalid");
    }
    const reasoning = response.output
      .flatMap((item) => (item.type === "reasoning" ? item.summary.map((part) => part.text.trim()) : []))
      .filter(Boolean)
      .join("\n\n");
    return {
      value,
      modelName: response.model,
      ...(reasoning ? { reasoning } : {}),
      ...(response.usage ? { usage: { input: response.usage.input_tokens ?? 0, output: response.usage.output_tokens ?? 0 } } : {}),
    };
  }
}
