import { ulid } from "ulid";
import {
  ArtifactValidationError, TaskValidationError, type Artifact, type FoodData, type SleepData, type TrainingData,
} from "../../domain";
import type { EntityBatchWriter } from "../../domain/ports";
import { AgentRunCancelledError, InvalidInputError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { AgentFilesService } from "../agent/config/agent-files.service";
import type { ArtifactBuilder } from "../artifacts/services/artifact-builder.service";
import type { CreateTaskUseCase } from "../tasks/create-task.usecase";
import type { FoodParsingGateway } from "../tasks/gateways/food-parsing.gateway";
import { FoodTotalsService } from "../tasks/services/food-totals.service";
import {
  agentFileEditOutput, foodEditOutput, sleepEditOutput, trainingEditOutput,
  type AgentFileEditOutput, type FoodEditOutput, type SleepEditOutput, type TrainingEditOutput,
} from "./request-agent-schemas";
import type { RequestAgentRunner } from "./request-agent-runner";
import type { StepRepositories } from "./request-entity-worker";
import { runStep, StepFailure, type StepPayload } from "./request-step-common";
import type { TargetEditAgent } from "./request-steps";
import type { EditTarget, NewEntity, RequestStore } from "./request-store";
import { askTarget } from "./request-target-edit";

/** Erro de regra do dominio vira passo vermelho com codigo; o resto (conflito, rede) segue como esta. */
async function rejecting<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ArtifactValidationError || error instanceof TaskValidationError || error instanceof InvalidInputError) {
      throw new StepFailure("rejected");
    }
    throw error;
  }
}

/**
 * Os agentes de edicao dos artefatos especificos da tela de detalhe (ADR 006): alimento, sono, treino e o arquivo
 * de uma skill ou agente. O alvo ja vem escolhido; o agente diz o que muda nele e o servidor valida e grava. Nunca
 * pergunta: sem mudanca ou recusa vira passo vermelho.
 */
export class RequestTargetEditWorker {
  private readonly totals = new FoodTotalsService();

  constructor(
    private readonly deps: {
      store: RequestStore;
      runner: RequestAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createTask: CreateTaskUseCase;
      foodParsing: FoodParsingGateway;
      artifactBuilder: Pick<ArtifactBuilder, "resolveUpdateData">;
      files: Pick<AgentFilesService, "write">;
    },
  ) {}

  async run(agent: TargetEditAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const target = step.input?.target;
      if (!target) throw new StepFailure("target_missing");
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createTask, () => request.createdAt,
      );
      const started = performance.now();
      let entities: NewEntity[];
      switch (agent) {
        case "food-edit":
          await this.food(session, await askTarget(runner, agent, foodEditOutput, request, step, signal));
          entities = this.updatedArtifacts(session);
          break;
        case "sleep-edit":
          await this.sleep(session, await askTarget(runner, agent, sleepEditOutput, request, step, signal));
          entities = this.updatedArtifacts(session);
          break;
        case "training-edit":
          await this.training(session, await askTarget(runner, agent, trainingEditOutput, request, step, signal));
          entities = this.updatedArtifacts(session);
          break;
        case "agent-file-edit":
          entities = await this.agentFile(target, await askTarget(runner, agent, agentFileEditOutput, request, step, signal));
          break;
      }
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      if (entities.length === 0) throw new StepFailure("nothing_to_change");

      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings }),
      });
    });
  }

  /**
   * O texto do alimento mudou: itens, totais e receita sao estimados de novo (a mesma estimativa da criacao); o
   * modelo do agente nunca escreve numeros. So titulo ou etiquetas: o `data` fica como esta.
   */
  private async food(session: AgentChangeSession, edits: FoodEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changes = { name: edit.name ?? undefined, tags: edit.tags ?? undefined };
      const artifact = await this.deps.repositories.artifacts.findById(edit.id);
      const current = artifact?.data as FoodData | undefined;
      if (!artifact || !current) throw new StepFailure("target_unknown");
      const description = edit.description?.trim();
      let data: FoodData | undefined;
      if (description && description !== current.description) {
        const parsed = await this.deps.foodParsing.parseFood({ text: description });
        if (!parsed.recipe) throw new StepFailure("rejected");
        const items = this.totals.toFoodItems(parsed.items);
        data = {
          description, items, totals: this.totals.calculate(items), recipe: parsed.recipe,
          ...(current.quantity ? { quantity: current.quantity } : {}),
          nutritionSource: "model-estimate", generation: { status: "completed" },
        };
      }
      if (data === undefined && changes.name === undefined && changes.tags === undefined) continue;
      const renamed = changes.name !== undefined || changes.tags !== undefined;
      await rejecting(() => session.reviseArtifactById(edit.id, (existing) => {
        // O conteudo calculado e do servidor: entra por `withGeneratedData`, e nao pela edicao do usuario.
        const generated = data ? existing.withGeneratedData(data) : existing;
        return renamed ? generated.revise(changes) : generated;
      }));
    }
  }

  private async sleep(session: AgentChangeSession, edits: SleepEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changed = edit.trackedSleepTime !== null || edit.score !== null;
      if (!changed && edit.name === null && edit.tags === null) continue;
      await rejecting(() => session.reviseArtifactById(edit.id, (existing) => {
        const data = existing.data as SleepData;
        return existing.revise({
          name: edit.name ?? undefined, tags: edit.tags ?? undefined,
          data: changed
            ? { trackedSleepTime: edit.trackedSleepTime ?? data.trackedSleepTime, score: edit.score ?? data.score }
            : undefined,
        });
      }));
    }
  }

  /**
   * A lista de treinos que o agente devolve e a que fica. Nome do treino e calorias totais saem dos exercicios
   * globais e da soma (as mesmas regras da edicao pelo formulario); calorias nao ditas ficam as do treino que ja
   * existia.
   */
  private async training(session: AgentChangeSession, edits: TrainingEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      if (edit.workouts === null && edit.name === null && edit.tags === null) continue;
      const artifact = await this.deps.repositories.artifacts.findById(edit.id);
      if (!artifact) throw new StepFailure("target_unknown");
      const existing = (artifact.data as TrainingData).workouts;
      const data = edit.workouts === null ? undefined : await rejecting(async () => {
        const workouts = (edit.workouts ?? []).map((workout, index) => {
          const previous = existing[index]?.workoutCode === workout.workoutCode ? existing[index] : undefined;
          const base = {
            id: previous?.id ?? ulid(), workoutName: "", calories: workout.calories ?? previous?.calories ?? 0,
            duration: workout.duration,
          };
          if (workout.workoutCode === "weightlifting") {
            return { ...base, workoutCode: workout.workoutCode, sets: (workout.sets ?? []).map((set) => ({ id: ulid(), ...set })) };
          }
          if (workout.workoutCode === "free") return { ...base, workoutCode: workout.workoutCode };
          return { ...base, workoutCode: workout.workoutCode, pace: workout.pace ?? 0, distance: workout.distance ?? 0 };
        });
        const resolved = await this.deps.artifactBuilder.resolveUpdateData({
          type: "training", data: { workouts, caloriesBurned: 0 },
        });
        return resolved.data;
      });
      await rejecting(() => session.reviseArtifactById(edit.id, (current: Artifact) =>
        current.revise({ name: edit.name ?? undefined, tags: edit.tags ?? undefined, data })));
    }
  }

  /**
   * O arquivo da skill ou do agente do Hermes: o texto novo substitui o antigo (com backup) e as sessoes novas o
   * leem. O caminho e o do alvo, nunca o do modelo. Um arquivo que tinha cabecalho `---` nao pode perde-lo. O
   * artefato que aponta para o arquivo e atualizado pela leitura da pasta, nao por este lote.
   */
  private async agentFile(target: EditTarget, edits: AgentFileEditOutput["edits"]): Promise<NewEntity[]> {
    const path = String(target.snapshot.path ?? "");
    const before = String(target.snapshot.text ?? "");
    const text = edits.find((edit) => edit.text !== null)?.text;
    if (!path || text === null || text === undefined) return [];
    const header = /^---\r?\n[\s\S]*?\r?\n---/;
    if (header.test(before) && !header.test(text)) throw new StepFailure("rejected");
    if (text === before) return [];
    await rejecting(() => this.deps.files.write(path, text));
    return [{ kind: "artifact", id: target.id, operation: "update" }];
  }

  private updatedArtifacts(session: AgentChangeSession): NewEntity[] {
    return session.result().updated
      .filter((item) => item.kind === "artifact")
      .map((item): NewEntity => ({ ...item, operation: "update" }));
  }
}
