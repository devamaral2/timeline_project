import { OpenRouter, maxCost, stepCountIs, tool } from "@openrouter/agent";
import type { Tool } from "@openrouter/agent";
import { getServerEnv } from "@/config/env";
import type {
  EventAgentGateway,
  EventAgentRunInput,
} from "../../application/contracts/event-agent.gateway";
import { LlmUnavailableError } from "../../application/errors/event-agent.errors";

/** Teto de rodadas do agente. 1 basta no caminho feliz; as demais são auto-correção. */
const MAX_STEPS = 3;
/** Teto de gasto por requisição, em dólares. Guard-rail para uma rota exposta. */
const MAX_COST_USD = 0.05;
/** Deadline para a execução de uma skill (grava no Firestore + parsing de comida). */
const TOOL_TIMEOUT_MS = 30_000;

type AgentClient = Pick<OpenRouter, "callModel">;

export class OpenRouterEventAgentGateway implements EventAgentGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_AGENT_MODEL ??
      getServerEnv().OPENROUTER_MODEL,
    private readonly createClient: (apiKey: string) => AgentClient = (key) =>
      new OpenRouter({ apiKey: key }),
  ) {}

  async run(input: EventAgentRunInput): Promise<{ modelName: string }> {
    if (!this.apiKey) throw new LlmUnavailableError("Missing OPENROUTER_API_KEY");
    if (!this.modelName) {
      throw new LlmUnavailableError("Missing OPENROUTER_AGENT_MODEL or OPENROUTER_MODEL");
    }

    // O agente para assim que um evento é criado, mantendo o caminho feliz em uma
    // única ida ao modelo. Quando a skill devolve erro a flag continua falsa e o
    // loop segue, dando ao modelo a chance de corrigir os argumentos.
    let createdAnyEvent = false;

    // Anotado como readonly Tool[] de propósito: sem isso o callModel infere um
    // TTools concreto e as stop conditions prontas (StopCondition<readonly Tool[]>)
    // deixam de ser atribuíveis, porque StopCondition é contravariante em TTools.
    const tools: readonly Tool[] = input.skills.map((skill) =>
      tool({
        name: skill.name,
        description: skill.description,
        inputSchema: skill.parameters,
        execute: async (args: unknown) => {
          const result = await input.execute({ name: skill.name, args });
          if (result.ok) createdAnyEvent = true;
          return result;
        },
      }),
    );

    console.log("[OpenRouterEventAgentGateway] running agent", {
      model: this.modelName,
      skills: input.skills.map((skill) => skill.name),
      textLength: input.text.length,
    });

    try {
      const result = this.createClient(this.apiKey).callModel({
        model: this.modelName,
        instructions: input.systemPrompt,
        input: input.text,
        tools,
        stopWhen: [() => createdAnyEvent, stepCountIs(MAX_STEPS), maxCost(MAX_COST_USD)],
        // Sem isto o SDK faria mais uma chamada ao modelo só para produzir um texto
        // final depois da tool — round-trip que não usamos, já que a resposta da
        // rota é montada a partir dos eventIds.
        allowFinalResponse: false,
        toolTimeoutMs: TOOL_TIMEOUT_MS,
      });

      await result.getResponse();
    } catch (error) {
      console.error("[OpenRouterEventAgentGateway] agent run failed", { error });
      throw new LlmUnavailableError("Falha ao consultar o modelo", error);
    }

    console.log("[OpenRouterEventAgentGateway] agent finished", { createdAnyEvent });

    return { modelName: this.modelName };
  }
}
