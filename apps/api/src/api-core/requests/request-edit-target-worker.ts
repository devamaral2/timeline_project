import type { RequestEditEntityType } from "@repo/contracts";
import type { Artifact, FoodData, SleepData, TrainingData } from "../../domain";
import type { ArtifactRepository, EventRepository } from "../../domain/ports";
import { newOrderedId } from "../../infrastructure/persistence/requests/request-rows";
import { AgentFileNotFoundError, type AgentFilesService } from "../agent/config/agent-files.service";
import { EDIT_TARGET_AGENTS } from "./request-steps";
import type { EditTarget, RequestStore } from "./request-store";

/** Por que o alvo nao pode ser editado; cada codigo tem o seu texto predefinido em `ui.json`. */
export type TargetFailure = "not_found" | "type_mismatch" | "busy";

/** O tipo de artefato que cada `entityType` de artefato exige. */
const ARTIFACT_TYPES: Partial<Record<RequestEditEntityType, string>> = {
  artifact: "text", food_artifact: "food", sleep_artifact: "sleep", training_artifact: "training",
  skill_artifact: "skill", agent_artifact: "agent",
};

const iso = (value: Date | undefined) => value?.toISOString() ?? null;

/**
 * O worker da edicao pela tela de detalhe (ADR 006). A rota ja gravou o pedido com o alvo; aqui o servidor carrega
 * a entidade, confere dono e tipo, escolhe o agente numa tabela (`EDIT_TARGET_AGENTS`) e cria o passo dele com o
 * retrato completo do alvo. Nao usa JEV nem modelo: o tipo vem do cliente e e conferido contra a entidade real.
 */
export class RequestEditTargetWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      repositories: { events: Pick<EventRepository, "findById">; artifacts: Pick<ArtifactRepository, "findById"> };
      files: Pick<AgentFilesService, "read">;
      /** Textos predefinidos de falha, por codigo. */
      failureText: (code: TargetFailure) => string;
    },
  ) {}

  async run(requestId: string): Promise<void> {
    const { store } = this.deps;
    const request = await store.find(requestId);
    if (request?.status !== "queued" || !request.target) return;

    const { entityType, entityId } = request.target;
    const resolved = await this.resolve(request.userId, entityType, entityId);
    if ("failure" in resolved) {
      await store.finish(request.id, "failed", {
        errorCode: resolved.failure === "busy" ? "conflict" : "invalid_input",
        message: this.deps.failureText(resolved.failure),
      });
      return;
    }
    const target: EditTarget = { entityType, id: entityId, snapshot: resolved.snapshot };
    await store.beginSteps(request.id, [
      { id: newOrderedId(), agent: EDIT_TARGET_AGENTS[entityType], expected: "one", input: { target } },
    ]);
  }

  private async resolve(
    userId: string,
    entityType: RequestEditEntityType,
    id: string,
  ): Promise<{ snapshot: Record<string, unknown> } | { failure: TargetFailure }> {
    const { events, artifacts } = this.deps.repositories;
    if (entityType === "task") {
      const event = await events.findById(id);
      if (!event || event.userId !== userId || event.actor !== "human") return { failure: "not_found" };
      return { snapshot: {
        name: event.name, kind: event.kind, status: event.status ?? null, priority: event.priority,
        description: event.description, location: event.location, tags: event.tags, longRunning: event.longRunning,
        startedAt: iso(event.startedAt), estimatedFinishAt: iso(event.estimatedFinishAt), finishedAt: iso(event.finishedAt),
      } };
    }
    const artifact = await artifacts.findById(id);
    if (!artifact || artifact.userId !== userId) return { failure: "not_found" };
    if (artifact.type !== ARTIFACT_TYPES[entityType]) return { failure: "type_mismatch" };
    return this.artifactSnapshot(artifact, entityType);
  }

  private artifactSnapshot(
    artifact: Artifact,
    entityType: RequestEditEntityType,
  ): { snapshot: Record<string, unknown> } | { failure: TargetFailure } {
    const base = { name: artifact.name, tags: artifact.tags };
    switch (entityType) {
      case "food_artifact": {
        const food = artifact.data as FoodData;
        if (food.generation?.status === "pending") return { failure: "busy" };
        return { snapshot: { ...base, description: food.description, items: food.items, totals: food.totals } };
      }
      case "sleep_artifact":
        return { snapshot: { ...base, ...(artifact.data as SleepData) } };
      case "training_artifact":
        return { snapshot: { ...base, workouts: (artifact.data as TrainingData).workouts } };
      case "skill_artifact":
      case "agent_artifact": {
        const { path, missing } = artifact.data as { path: string; missing: boolean };
        if (missing) return { failure: "not_found" };
        try {
          return { snapshot: { ...base, path, text: this.deps.files.read(path).text } };
        } catch (error) {
          if (error instanceof AgentFileNotFoundError) return { failure: "not_found" };
          throw error;
        }
      }
      default:
        return { snapshot: { ...base, text: (artifact.data as { body: string }).body } };
    }
  }
}
