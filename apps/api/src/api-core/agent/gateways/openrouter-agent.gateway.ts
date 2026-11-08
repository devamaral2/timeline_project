import { getServerEnv } from "../../../config/env";
import { agentsConfig, promptsConfig } from "../config/agent-config";
import { AgentRunCancelledError, LlmUnavailableError } from "../errors/agent.errors";
import type { AgentGateway, AgentRunInput, AgentRunResult } from "./agent.gateway";

/*
 * Limites lidos a cada uso, da versao ativa da configuracao (ver config/agent-config.ts).
 * Funcoes, e nao constantes, para que uma publicacao valha no pedido seguinte.
 */

/** Consultas encadeadas + preparacao das mudancas + resposta. */
export function maxSteps(): number {
  return agentsConfig.limits.maxSteps;
}
/** Teto de gasto por requisicao, em dolares. `maxCost` conta custo nao reportado como 0 — o teto de passos e o limite real. */
export function maxCostUsd(): number {
  return agentsConfig.limits.maxCostUsd;
}
export function maxToolResultChars(): number {
  return agentsConfig.limits.maxToolResultChars;
}
export function finalResponseDirective(): string {
  return promptsConfig.finalResponseDirective;
}

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
        stopWhen: [limit(stepCountIs(maxSteps())), limit(maxCost(maxCostUsd()))],
        allowFinalResponse: finalResponseDirective(),
        // Duas mudancas no mesmo registro na mesma rodada nao podem correr em
        // paralelo: a segunda precisa ver a primeira ja preparada.
        toolConcurrency: 1,
        toolTimeoutMs: agentsConfig.limits.toolTimeoutMs,
        signal: input.signal
          ? AbortSignal.any([AbortSignal.timeout(agentsConfig.limits.runTimeoutMs), input.signal])
          : AbortSignal.timeout(agentsConfig.limits.runTimeoutMs),
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
  const max = maxToolResultChars();
  if (serialized.length <= max) return result;
  return { truncated: true, preview: serialized.slice(0, max) };
}
