import { failureExplanationOutput } from "./request-agent-schemas";
import { isInProgressAgentStatus } from "../../domain/agent-status";
import type { RequestAgentRunner } from "./request-agent-runner";
import { stepLabel } from "./request-config";
import type { StepPayload } from "./request-step-common";
import type { RequestRecord, RequestStore, StepRecord } from "./request-store";

/**
 * A fila de finalizacao (um job por vez por pedido). Marca como concluido o que o passo criou ou alterou e fecha o
 * pedido quando todos os passos terminaram. Nao liga nada: quem diz a que tarefa um artefato pertence e o agente
 * de escrita, e a ligacao nasce no mesmo lote do passo.
 */
export class RequestFinalizer {
  constructor(
    private readonly deps: {
      store: RequestStore;
      /** Explica o que falhou quando algum passo falha; sem ele, a caixa do pedido usa a linha predefinida. */
      runner?: RequestAgentRunner;
    },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    const request = await store.find(payload.requestId);
    if (!request || !isInProgressAgentStatus(request.status)) return;

    const entities = await store.entities(request.id);
    for (const entity of entities.filter((candidate) => candidate.stepId === payload.stepId && !candidate.finalized)) {
      signal?.throwIfAborted();
      await store.markFinalized(undefined, entity, []);
    }
    await this.closeIfDone(request);
  }

  private async closeIfDone(request: RequestRecord): Promise<void> {
    const { store } = this.deps;
    const [steps, entities] = await Promise.all([store.steps(request.id), store.entities(request.id)]);
    const open = steps.some((step) => isInProgressAgentStatus(step.status));
    if (open || entities.some((entity) => !entity.finalized)) return;
    const failed = steps.filter((step) => step.status === "failed");
    const failedSteps = failed.map((step) => ({ agent: step.agent, errorCode: step.errorCode ?? "internal" }));
    const explained = failed.length > 0 ? await this.explain(request, steps) : undefined;
    await store.finish(request.id, failed.length === steps.length ? "failed" : "completed", {
      failedSteps,
      ...(explained ? { message: explained.message } : {}),
      ...(explained?.reasoning ? { thought: explained.reasoning } : {}),
    });
  }

  /** So em caso de falha, uma chamada curta diz o que falhou. Se ela mesma falha, vale a linha predefinida. */
  private async explain(
    request: RequestRecord,
    steps: readonly StepRecord[],
  ): Promise<{ message: string; reasoning?: string } | undefined> {
    const { runner } = this.deps;
    if (!runner) return undefined;
    const line = (step: StepRecord) => `- ${stepLabel(step.agent)}${step.errorCode ? ` (código: ${step.errorCode})` : ""}`;
    try {
      const { value, reasoning } = await runner.run({
        agent: "failure-explainer", now: request.createdAt, schema: failureExplanationOutput, model: request.model,
        user: [
          "Pedido:", request.prompt, "",
          "Passos que falharam:", ...steps.filter((step) => step.status === "failed").map(line), "",
          "Passos que deram certo:", ...(steps.some((step) => step.status === "completed")
            ? steps.filter((step) => step.status === "completed").map(line)
            : ["- nenhum"]),
        ].join("\n"),
      });
      return { message: value.message, ...(reasoning ? { reasoning } : {}) };
    } catch {
      return undefined;
    }
  }
}
