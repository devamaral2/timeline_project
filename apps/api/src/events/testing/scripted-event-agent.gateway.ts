import type {
  EventAgentGateway,
  EventAgentRunInput,
  SkillExecutionResult,
} from "../gateways/event-agent.gateway";

export interface ScriptedAgentCall {
  name: string;
  args: unknown;
}

/**
 * Substitui o agente real acionando skills a partir de um roteiro fixo, uma
 * rodada por entrada. Guarda o resultado de cada chamada para que os testes
 * possam afirmar o que o modelo teria visto como tool result.
 */
export class ScriptedEventAgentGateway implements EventAgentGateway {
  readonly results: SkillExecutionResult[] = [];
  lastRunInput?: EventAgentRunInput;

  constructor(
    private readonly rounds: ScriptedAgentCall[][],
    private readonly modelName = "scripted-model",
  ) {}

  async run(input: EventAgentRunInput): Promise<{ modelName: string }> {
    this.lastRunInput = input;

    for (const round of this.rounds) {
      for (const call of round) {
        this.results.push(await input.execute(call));
      }
      // Espelha o stop condition da gateway real: para assim que um evento é criado.
      if (this.results.some((result) => result.ok)) break;
    }

    return { modelName: this.modelName };
  }
}
