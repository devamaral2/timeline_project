import { ulid } from "ulid";
import {
  EventValidationError, NoteValidationError, type MealItem, type Note, type TrainingData,
} from "../../domain";
import type { EntityBatchWriter, EventRepository, NoteRepository, RecurrenceRepository, TaskRepository } from "../../domain/ports";
import { getCurrentAiJob, setAiJobResult } from "../../infrastructure/ai-jobs/ai-job-context";
import { AgentRunCancelledError, InvalidInputError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { AgentFilesService } from "../agent/config/agent-files.service";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import type { MealParsingGateway } from "../events/gateways/meal-parsing.gateway";
import { MealTotalsService } from "../events/services/meal-totals.service";
import type { NoteBuilder } from "../notes/services/note-builder.service";
import {
  agentSkillNoteEditOutput, foodNoteEditOutput, sleepNoteEditOutput, trainingEditOutput,
  type TrainingEditOutput,
} from "./process-agent-schemas";
import type { ProcessAgentRunner } from "./process-agent-runner";
import { runStep, StepFailure, type StepPayload } from "./process-step-common";
import { askTarget } from "./process-target-edit";
import type { TargetEditAgent } from "./process-steps";
import type { EditTarget, NewEntity, ProcessStore } from "./process-store";

const NOTE_PREVIEW_CHARS = 200;

/** Erro de regra do dominio vira passo vermelho com codigo; o resto (conflito, rede) segue como esta. */
async function rejecting<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NoteValidationError || error instanceof EventValidationError || error instanceof InvalidInputError) {
      throw new StepFailure("rejected");
    }
    throw error;
  }
}

/**
 * Os agentes de edicao de notas especificas da tela de detalhe (ADR 006): refeicao, sono, treino e o arquivo de
 * uma skill ou agente. O alvo ja vem escolhido; o agente diz o que muda nele e o servidor valida e grava. Nunca
 * pergunta: sem mudanca ou recusa vira passo vermelho.
 */
export class ProcessTargetEditWorker {
  private readonly totals = new MealTotalsService();

  constructor(
    private readonly deps: {
      store: ProcessStore;
      runner: ProcessAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository; recurrences?: RecurrenceRepository };
      createEvent: CreateEventUseCase;
      mealParsing: MealParsingGateway;
      noteBuilder: Pick<NoteBuilder, "resolveUpdateData">;
      files: Pick<AgentFilesService, "write">;
    },
  ) {}

  async run(agent: TargetEditAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner } = this.deps;
    await runStep(store, payload, signal, async ({ process, step, timings }) => {
      const target = step.input?.target;
      if (!target) throw new StepFailure("target_missing");
      const session = new AgentChangeSession(
        process.userId, this.deps.repositories, this.deps.createEvent, () => process.createdAt,
      );
      const started = performance.now();
      let entities: NewEntity[];
      switch (agent) {
        case "food-note-edit":
          await this.food(session, await askTarget(runner, agent, foodNoteEditOutput, process, step, signal));
          entities = await this.updatedNotes(session);
          break;
        case "sleep-note-edit":
          await this.sleep(session, await askTarget(runner, agent, sleepNoteEditOutput, process, step, signal));
          entities = await this.updatedNotes(session);
          break;
        case "training-edit":
          await this.training(session, await askTarget(runner, agent, trainingEditOutput, process, step, signal));
          entities = await this.updatedNotes(session);
          break;
        case "agent-skill-note-edit":
          entities = await this.skillFile(target, await askTarget(runner, agent, agentSkillNoteEditOutput, process, step, signal));
          break;
      }
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      if (entities.length === 0) throw new StepFailure("nothing_to_change");

      if (getCurrentAiJob()) setAiJobResult({ stepId: step.id });
      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, { processId: process.id, stepId: step.id, entities, timings }),
      });
    });
  }

  /**
   * O texto da refeicao mudou: itens, totais e receita sao estimados de novo (a mesma estimativa da criacao); o
   * modelo do agente nunca escreve numeros. So titulo ou etiquetas: o `data` fica como esta.
   */
  private async food(
    session: AgentChangeSession,
    edits: ReturnType<typeof foodNoteEditOutput.parse>["edits"],
  ): Promise<void> {
    for (const edit of edits) {
      const changes = { name: edit.name ?? undefined, tags: edit.tags ?? undefined };
      const note = await this.deps.repositories.notes.findById(edit.id);
      const current = note?.data as MealItem | undefined;
      if (!note || !current) throw new StepFailure("target_unknown");
      const description = edit.description?.trim();
      let data: MealItem | undefined;
      if (description && description !== current.description) {
        const parsed = await this.deps.mealParsing.parseMeal({ text: description });
        if (!parsed.recipe) throw new StepFailure("rejected");
        const foodItems = this.totals.toFoodItems(parsed.items);
        data = {
          name: current.name, description, foodItems, totals: this.totals.calculate(foodItems),
          recipe: parsed.recipe, nutritionSource: "model-estimate", generation: { status: "completed" },
        };
      }
      if (data === undefined && changes.name === undefined && changes.tags === undefined) continue;
      await rejecting(() => session.reviseNoteById(edit.id, (existing) => existing.revise({ ...changes, data })));
    }
  }

  private async sleep(session: AgentChangeSession, edits: ReturnType<typeof sleepNoteEditOutput.parse>["edits"]): Promise<void> {
    for (const edit of edits) {
      const changed = edit.trackedSleepTime !== null || edit.score !== null;
      if (!changed && edit.name === null && edit.tags === null) continue;
      await rejecting(() => session.reviseNoteById(edit.id, (existing) => {
        const data = existing.data as { trackedSleepTime: number; score: number };
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
   * A lista de treinos que o agente devolve e a que fica. Nome do treino e calorias totais saem do catalogo e da
   * soma (as mesmas regras da edicao pelo formulario); calorias nao ditas ficam as do treino que ja existia.
   */
  private async training(session: AgentChangeSession, edits: TrainingEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      if (edit.workouts === null && edit.name === null && edit.tags === null) continue;
      const note = await this.deps.repositories.notes.findById(edit.id);
      if (!note) throw new StepFailure("target_unknown");
      const existing = (note.data as TrainingData).workouts;
      const data = edit.workouts === null ? undefined : await rejecting(async () => {
        const workouts = (edit.workouts ?? []).map((workout, index) => {
          const previous = existing[index]?.workoutCode === workout.workoutCode ? existing[index] : undefined;
          const base = { id: previous?.id ?? ulid(), calories: workout.calories ?? previous?.calories ?? 0, duration: workout.duration };
          if (workout.workoutCode === "weightlifting") {
            return { ...base, workoutCode: workout.workoutCode, sets: (workout.sets ?? []).map((set) => ({ ...set })) };
          }
          if (workout.workoutCode === "free") return { ...base, workoutCode: workout.workoutCode };
          return { ...base, workoutCode: workout.workoutCode, pace: workout.pace ?? 0, distance: workout.distance ?? 0 };
        });
        const resolved = await this.deps.noteBuilder.resolveUpdateData(
          { type: "training", data: { workouts } } as unknown as Parameters<NoteBuilder["resolveUpdateData"]>[0],
        );
        return resolved.data;
      });
      await rejecting(() => session.reviseNoteById(edit.id, (current: Note) =>
        current.revise({ name: edit.name ?? undefined, tags: edit.tags ?? undefined, data })));
    }
  }

  /**
   * O arquivo da skill ou do agente do Hermes: o texto novo substitui o antigo (com backup) e as sessoes novas o
   * leem. O caminho e o do alvo, nunca o do modelo. Um arquivo que tinha cabecalho `---` nao pode perde-lo.
   */
  private async skillFile(
    target: EditTarget,
    edits: ReturnType<typeof agentSkillNoteEditOutput.parse>["edits"],
  ): Promise<NewEntity[]> {
    const path = String(target.snapshot.path ?? "");
    const before = String(target.snapshot.text ?? "");
    const text = edits.find((edit) => edit.text !== null)?.text;
    if (!path || text === null || text === undefined) return [];
    const header = /^---\r?\n[\s\S]*?\r?\n---/;
    if (header.test(before) && !header.test(text)) throw new StepFailure("rejected");
    if (text === before) return [];
    await rejecting(() => this.deps.files.write(path, text));
    return [{
      kind: "note", id: target.id, operation: "update",
      summary: {
        name: String(target.snapshot.name ?? path), noteType: target.entityType === "agent_note" ? "agent" : "skill",
        text: text.slice(0, NOTE_PREVIEW_CHARS),
      },
    }];
  }

  private async updatedNotes(session: AgentChangeSession): Promise<NewEntity[]> {
    const { updated } = await session.result();
    return updated.flatMap((item): NewEntity[] =>
      item.kind === "note"
        ? [{ kind: "note", id: item.id, operation: "update", summary: { name: item.name, noteType: item.type } }]
        : []);
  }
}
