import type { EntityBatchWriter } from "../../domain/ports";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { CreateTaskUseCase } from "../tasks/create-task.usecase";
import { artifactEditOutput, taskEditOutput } from "./request-agent-schemas";
import type { RequestAgentRunner } from "./request-agent-runner";
import { applyArtifactEdits, applyTaskEdits, type Places } from "./request-entity-changes";
import type { StepRepositories } from "./request-entity-worker";
import { runStep, StepFailure, type StepPayload } from "./request-step-common";
import type { EntityEditAgent } from "./request-steps";
import type { NewEntity, RequestStore } from "./request-store";
import { askTarget } from "./request-target-edit";

/**
 * Edita a tarefa ou o artefato de texto aberto na tela de detalhe (ADR 006). O alvo e conhecido: o agente so diz o
 * que muda nele, e o servidor recusa qualquer outro id. Nunca pergunta: sem mudanca, o passo fica vermelho. As
 * edicoes pedidas no chat nao passam por aqui: sao do agente unico de escrita (`RequestEntityWorker`).
 */
export class RequestEditWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      runner: RequestAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createTask: CreateTaskUseCase;
      places?: Places;
    },
  ) {}

  async run(agent: EntityEditAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner, places } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createTask, () => request.createdAt,
      );
      const started = performance.now();
      if (agent === "task-edit") {
        await applyTaskEdits(session, await askTarget(runner, agent, taskEditOutput, request, step, signal), places);
      } else {
        await applyArtifactEdits(session, await askTarget(runner, agent, artifactEditOutput, request, step, signal));
      }
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();

      // O que nasceu no passo sao as subtarefas novas: entram como criadas, depois da tarefa alterada.
      const { created, updated } = session.result();
      const entities: NewEntity[] = [
        ...updated.map((item): NewEntity => ({ ...item, operation: "update" })),
        ...created.map((item): NewEntity => ({ ...item, operation: "create" })),
      ];
      if (entities.length === 0) throw new StepFailure("nothing_to_change");
      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        requestId: request.id,
        afterWrite: (tx) => store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings }),
      });
    });
  }
}
