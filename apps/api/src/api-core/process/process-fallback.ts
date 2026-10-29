import { getCurrentAiJob, setAiJobResult } from "../../infrastructure/ai-jobs/ai-job-context";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { fallbackOutput } from "./process-agent-schemas";
import { describeRequest, type ProcessAgentRunner } from "./process-agent-runner";
import { runStep, StepFailure, type StepPayload } from "./process-step-common";
import { newStepId } from "./process-steps";
import type { NewStep, ProcessStore } from "./process-store";

/** Quantos especialistas o fallback pode chamar de uma vez. */
const MAX_INVOKED = 6;

/**
 * A fila de "nenhum outro caso": pedidos que nao se encaixaram em nenhuma operacao. O agente ou responde (pedido
 * sem relacao com as entidades) ou chama os especialistas. Os passos que ele chama entram pelo mesmo mecanismo do
 * despacho, na mesma transacao em que o passo do fallback termina; o fallback nunca se chama.
 */
export class ProcessFallback {
  constructor(
    private readonly deps: { store: ProcessStore; runner: ProcessAgentRunner },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner } = this.deps;
    await runStep(store, payload, signal, async ({ process, step, timings }) => {
      if (process.status !== "running" && process.status !== "dispatching") return;
      const started = performance.now();
      const { value } = await runner.run({
        agent: "fallback", now: process.createdAt, schema: fallbackOutput, signal,
        user: describeRequest(process.prompt, undefined, process.context),
      });
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();

      const invoked: NewStep[] = (value.invoke ?? []).slice(0, MAX_INVOKED).map((call) => ({
        id: newStepId(), agent: call.agent, expected: "one", input: { instruction: call.instruction },
      }));
      if (getCurrentAiJob()) setAiJobResult({ stepId: step.id });
      if (invoked.length > 0) {
        await store.handOff(process.id, step.id, invoked);
        return;
      }
      if (!value.reply) throw new StepFailure("empty");
      await store.finishFallback(process.id, step.id, value.reply);
    });
  }
}
