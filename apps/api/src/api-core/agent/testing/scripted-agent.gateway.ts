import { AgentRunCancelledError } from "../errors/agent.errors";
import type { AgentGateway, AgentRunInput, AgentRunResult } from "../gateways/agent.gateway";

export interface ScriptedToolCall {
  name: string;
  /** Uma funcao recebe o que as chamadas anteriores devolveram — ex.: o id criado. */
  args: unknown | ((previousResults: unknown[]) => unknown);
}

/**
 * Substitui o modelo por um roteiro: chama as ferramentas na ordem dada e
 * devolve o texto final. Guarda o que cada ferramenta respondeu, que e o que o
 * modelo teria visto.
 */
export class ScriptedAgentGateway implements AgentGateway {
  readonly results: unknown[] = [];
  lastInput?: AgentRunInput;
  private hold?: Promise<void>;

  constructor(
    private calls: ScriptedToolCall[] = [],
    private readonly finalText = "Feito.",
    private readonly stoppedByLimit = false,
  ) {}

  /** Troca o roteiro depois de semear dados cujos ids a chamada precisa. */
  respondWith(calls: ScriptedToolCall[]): this {
    this.calls = calls;
    return this;
  }

  /**
   * Depois das ferramentas, espera `until` antes de responder — como um modelo
   * ainda pensando. Um abort nesse meio tempo lanca, como a gateway real.
   */
  holdUntil(until: Promise<void>): this {
    this.hold = until;
    return this;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    this.lastInput = input;
    for (const call of this.calls) {
      const tool = input.tools.find((candidate) => candidate.name === call.name);
      const args = typeof call.args === "function" ? call.args(this.results) : call.args;
      if (tool) input.onToolCall?.(tool.name);
      this.results.push(
        tool ? await tool.execute(args) : { ok: false, error: `Ferramenta desconhecida: ${call.name}` },
      );
    }
    if (this.hold) await waitOrAbort(this.hold, input.signal);
    return { text: this.finalText, modelName: "scripted-model", stoppedByLimit: this.stoppedByLimit };
  }
}

function waitOrAbort(until: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AgentRunCancelledError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new AgentRunCancelledError());
    signal?.addEventListener("abort", onAbort, { once: true });
    until.then(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, reject);
  });
}
