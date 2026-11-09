import type { AiProcessEditEntityType } from "@repo/contracts";
import type { EventRepository, NoteRepository, TaskRepository } from "../../domain/ports";
import type { MealItem, Note, TrainingData } from "../../domain";
import { AgentFileNotFoundError, type AgentFilesService } from "../agent/config/agent-files.service";
import { EDIT_TARGET_AGENTS, newStepId } from "./process-steps";
import type { EditTarget, ProcessStore } from "./process-store";

export interface EditTargetPayload {
  processId: string;
  entityType: AiProcessEditEntityType;
  entityId: string;
}

/** Por que o alvo nao pode ser editado; cada codigo tem o seu texto predefinido em `ui.json`. */
export type TargetFailure = "not_found" | "type_mismatch" | "busy";

/** O tipo de nota que cada `entityType` de nota exige. */
const NOTE_TYPES: Partial<Record<AiProcessEditEntityType, string>> = {
  note: "text", meal_note: "meal", sleep_note: "sleep", training_note: "training", skill_note: "skill", agent_note: "agent",
};

const iso = (value: Date | undefined) => value?.toISOString() ?? null;

/**
 * O worker da edicao pela tela de detalhe (ADR 006). A rota ja gravou o processo; aqui o servidor carrega a
 * entidade, confere dono e tipo, escolhe o agente numa tabela (`EDIT_TARGET_AGENTS`) e cria o passo dele com o
 * retrato completo do alvo. Nao usa JEV nem modelo: o tipo vem do cliente e e conferido contra a entidade real.
 */
export class ProcessEditTargetWorker {
  constructor(
    private readonly deps: {
      store: ProcessStore;
      repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository };
      files: Pick<AgentFilesService, "read">;
      /** Textos predefinidos de falha, por codigo. */
      failureText: (code: TargetFailure) => string;
    },
  ) {}

  async run(payload: EditTargetPayload): Promise<void> {
    const { store } = this.deps;
    const process = await store.find(payload.processId);
    if (process?.status !== "dispatching") return;

    const resolved = await this.resolve(process.userId, payload.entityType, payload.entityId);
    if ("failure" in resolved) {
      await store.finish(process.id, "failed", { failedSteps: [], text: this.deps.failureText(resolved.failure) });
      return;
    }
    const target: EditTarget = { entityType: payload.entityType, id: payload.entityId, snapshot: resolved.snapshot };
    await store.beginSteps(
      process.id,
      [{ id: newStepId(), agent: EDIT_TARGET_AGENTS[payload.entityType], expected: "one", input: { target } }],
      { mode: "target", entityType: payload.entityType },
    );
  }

  private async resolve(
    userId: string,
    entityType: AiProcessEditEntityType,
    id: string,
  ): Promise<{ snapshot: Record<string, unknown> } | { failure: TargetFailure }> {
    const { events, tasks, notes } = this.deps.repositories;
    if (entityType === "event") {
      const event = await events.findById(id);
      if (!event || event.userId !== userId) return { failure: "not_found" };
      return { snapshot: {
        name: event.name, kind: event.kind, description: event.description, tags: event.tags,
        startedAt: iso(event.startedAt), finishedAt: iso(event.finishedAt),
      } };
    }
    if (entityType === "task") {
      const task = await tasks.findById(id);
      if (!task || task.userId !== userId) return { failure: "not_found" };
      return { snapshot: {
        name: task.name, description: task.description, status: task.status, priority: task.priority, tags: task.tags,
        startedAt: iso(task.startedAt), estimatedFinishAt: iso(task.estimatedFinishAt), finishedAt: iso(task.finishedAt),
      } };
    }
    const note = await notes.findById(id);
    if (!note || note.userId !== userId) return { failure: "not_found" };
    if (note.type !== NOTE_TYPES[entityType]) return { failure: "type_mismatch" };
    return this.noteSnapshot(note, entityType);
  }

  private async noteSnapshot(
    note: Note,
    entityType: AiProcessEditEntityType,
  ): Promise<{ snapshot: Record<string, unknown> } | { failure: TargetFailure }> {
    const base = { name: note.name, tags: note.tags };
    switch (entityType) {
      case "meal_note": {
        const meal = note.data as MealItem;
        if (meal.generation?.status === "pending") return { failure: "busy" };
        return { snapshot: {
          ...base, description: meal.description, mealName: meal.name, foodItems: meal.foodItems, totals: meal.totals,
        } };
      }
      case "sleep_note":
        return { snapshot: { ...base, ...(note.data as { trackedSleepTime: number; score: number }) } };
      case "training_note":
        return { snapshot: { ...base, workouts: (note.data as TrainingData).workouts } };
      case "skill_note":
      case "agent_note": {
        const path = (note.data as { path: string; missing: boolean }).path;
        if ((note.data as { missing: boolean }).missing) return { failure: "not_found" };
        try {
          return { snapshot: { ...base, path, text: this.deps.files.read(path).text } };
        } catch (error) {
          if (error instanceof AgentFileNotFoundError) return { failure: "not_found" };
          throw error;
        }
      }
      default:
        return { snapshot: { ...base, text: (note.data as { body: string }).body } };
    }
  }
}
