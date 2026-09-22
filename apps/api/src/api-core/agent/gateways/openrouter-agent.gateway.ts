import { getServerEnv } from "../../../config/env";
import { AgentRunCancelledError, LlmUnavailableError } from "../errors/agent.errors";
import type { AgentGateway, AgentRunInput, AgentRunResult } from "./agent.gateway";

/** Consultas encadeadas + preparacao das mudancas + resposta. */
export const MAX_STEPS = 12;
/** Teto de gasto por requisicao, em dolares. `maxCost` conta custo nao reportado como 0 — o teto de passos e o limite real. */
export const MAX_COST_USD = 0.25;
/** Uma query com timeout proprio de 3s, ou o parse de refeicao pelo modelo. */
const TOOL_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 120_000;
export const MAX_TOOL_RESULT_CHARS = 24_000;

export const FINAL_RESPONSE_DIRECTIVE =
  "Encerre agora sem chamar ferramentas: responda ao usuário em português, com base apenas no que já foi consultado e preparado.";

type AgentModule = typeof import("@openrouter/agent", { with: { "resolution-mode": "import" } });
type AgentClient = Pick<InstanceType<AgentModule["OpenRouter"]>, "callModel">;
type StopCondition = ReturnType<AgentModule["stepCountIs"]>;
type Tool = ReturnType<AgentModule["tool"]>;

let agentModule: Promise<AgentModule> | undefined;

/**
 * `@openrouter/agent` e ESM-only e este app roda em CommonJS. Um `import`
 * estatico viraria `require()` e quebraria na carga; `await import()` a partir
 * de CJS funciona, e o modulo fica cacheado depois da primeira chamada.
 */
function loadAgentModule(): Promise<AgentModule> {
  agentModule ??= import("@openrouter/agent");
  return agentModule;
}

export class OpenRouterAgentGateway implements AgentGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_AGENT_MODEL ??
      getServerEnv().OPENROUTER_MODEL,
    private readonly createClient?: (apiKey: string) => AgentClient,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (!this.apiKey) throw new LlmUnavailableError("Missing OPENROUTER_API_KEY");
    if (!this.modelName) {
      throw new LlmUnavailableError("Missing OPENROUTER_AGENT_MODEL or OPENROUTER_MODEL");
    }

    const { OpenRouter, maxCost, stepCountIs, tool } = await loadAgentModule();
    const createClient =
      this.createClient ?? ((key: string): AgentClient => new OpenRouter({ apiKey: key }));

    let stoppedByLimit = false;
    const limit =
      (condition: StopCondition): StopCondition =>
      async (options) => {
        const reached = await condition(options);
        if (reached) stoppedByLimit = true;
        return reached;
      };

    // Anotado como readonly Tool[] de proposito: sem isso o callModel infere um
    // TTools concreto e as stop conditions prontas deixam de ser atribuiveis.
    const tools: readonly Tool[] = input.tools.map((agentTool) =>
      tool({
        name: agentTool.name,
        description: agentTool.description,
        inputSchema: agentTool.parameters,
        execute: async (args: unknown) => {
          input.onToolCall?.(agentTool.name);
          return capToolResult(await agentTool.execute(args));
        },
      }),
    );

    try {
      const result = createClient(this.apiKey).callModel({
        model: this.modelName,
        instructions: input.systemPrompt,
        input: input.text,
        tools,
        stopWhen: [limit(stepCountIs(MAX_STEPS)), limit(maxCost(MAX_COST_USD))],
        allowFinalResponse: FINAL_RESPONSE_DIRECTIVE,
        // Duas mudancas no mesmo registro na mesma rodada nao podem correr em
        // paralelo: a segunda precisa ver a primeira ja preparada.
        toolConcurrency: 1,
        toolTimeoutMs: TOOL_TIMEOUT_MS,
        signal: input.signal
          ? AbortSignal.any([AbortSignal.timeout(RUN_TIMEOUT_MS), input.signal])
          : AbortSignal.timeout(RUN_TIMEOUT_MS),
      });

      const text = await result.getText();
      return { text, modelName: this.modelName, stoppedByLimit };
    } catch (error) {
      // Cancelar nao e falha do provedor: quem pediu parou de esperar.
      if (input.signal?.aborted) throw new AgentRunCancelledError();
      console.error("[OpenRouterAgentGateway] agent run failed", { error });
      throw new LlmUnavailableError("Falha ao consultar o modelo", error);
    }
  }
}

export function capToolResult(result: unknown): unknown {
  const serialized = JSON.stringify(result) ?? "null";
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) return result;
  return { truncated: true, preview: serialized.slice(0, MAX_TOOL_RESULT_CHARS) };
}
