import { newOrderedId } from "../../infrastructure/persistence/requests/request-rows";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { fallbackFinalOutput, fallbackOutput, type FallbackOutput } from "./request-agent-schemas";
import { describeRequest, type RequestAgentRunner } from "./request-agent-runner";
import { describeRound, loopRounds, MAX_ROUNDS } from "./request-fallback-loop";
import { runStep, StepFailure, type StepPayload } from "./request-step-common";
import type { FailedStep, NewStep, RequestRecord, RequestStore, StepRecord } from "./request-store";

/** Quantos especialistas o fallback pode chamar de uma vez. */
const MAX_INVOKED = 6;

/**
 * A fila de "nenhum outro caso": pedidos que nao se encaixaram em nenhuma operacao. O agente ou responde (pedido
 * sem relacao com as entidades) ou chama os especialistas. Os passos que ele chama entram pelo mesmo mecanismo do
 * despacho, na mesma transacao em que o passo do fallback termina; o fallback nunca se chama.
 *
 * O pedido que chega por `fallback: <pedido>` roda em laco (`request-fallback-loop.ts`): o passo traz a rodada,
 * e quando os especialistas terminam a finalizacao enfileira a rodada seguinte, em vez de fechar o pedido.
 */
export class RequestFallback {
  constructor(
    private readonly deps: { store: RequestStore; runner: RequestAgentRunner },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const started = performance.now();
      const round = step.input?.round;
      const { value, failedSteps } = round === undefined
        ? { value: await this.once(request, step.id, signal), failedSteps: [] }
        : await this.round(request, step.id, round, signal);
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();

      const invoked: NewStep[] = (value.invoke ?? []).slice(0, MAX_INVOKED).map((call) => ({
        id: newOrderedId(), agent: call.agent, expected: "one", input: { instruction: call.instruction },
      }));
      if (invoked.length > 0) {
        await store.handOff(request.id, step.id, invoked);
        return;
      }
      if (!value.reply) throw new StepFailure("empty");
      await store.finishFallback(request.id, step.id, value.reply, failedSteps);
    });
  }

  /** Fallback do despacho: uma chamada so; o que os especialistas fizerem nao volta para ca. */
  private async once(request: RequestRecord, stepId: string, signal?: AbortSignal): Promise<FallbackOutput> {
    const { value } = await this.deps.runner.run({
      agent: "fallback", now: request.createdAt, schema: fallbackOutput, signal, stepId,
      user: describeRequest(request.prompt, undefined, request.context),
    });
    return value;
  }

  /** Uma rodada do laco: o modelo ve o que as rodadas anteriores fizeram; na ultima, so pode responder. */
  private async round(
    request: RequestRecord,
    stepId: string,
    round: number,
    signal?: AbortSignal,
  ): Promise<{ value: FallbackOutput; failedSteps: FailedStep[] }> {
    const { store, runner } = this.deps;
    const [steps, entities] = await Promise.all([store.steps(request.id), store.entities(request.id)]);
    const user = describeRound(describeRequest(request.prompt, undefined, request.context), round, loopRounds(steps, entities));
    const failedSteps = steps.filter((step: StepRecord) => step.status === "failed")
      .map((step) => ({ agent: step.agent, errorCode: step.errorCode ?? "internal" }));
    // Quem escolheu o fallback aceitou esperar: so aqui o modelo pensa. Os especialistas que ele chama, nao.
    const call = { agent: "fallback-loop", now: request.createdAt, signal, stepId, user, think: true };
    if (round >= MAX_ROUNDS) {
      const { value } = await runner.run({ ...call, schema: fallbackFinalOutput });
      return { value: { reply: value.reply, invoke: null }, failedSteps };
    }
    const { value } = await runner.run({ ...call, schema: fallbackOutput });
    return { value, failedSteps };
  }
}
