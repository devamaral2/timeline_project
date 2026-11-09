import type { CreateRecurrenceInput } from "@repo/contracts";
import type { EntityBatchWriter, EventRepository, NoteRepository, RecurrenceRepository, TaskRepository } from "../../domain/ports";
import { getCurrentAiJob, setAiJobResult } from "../../infrastructure/ai-jobs/ai-job-context";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { TIME_ZONE } from "../agent/time";
import {
  eventCreateOutput, noteCreateOutput, recurringEventCreateOutput, recurringTaskCreateOutput, taskCreateOutput,
  type EventCreateOutput, type NoteCreateOutput, type TaskCreateOutput,
} from "./process-agent-schemas";
import { eventSeriesInput, RuleError, taskSeriesInput } from "./process-recurrence";
import { describeRequest, type ProcessAgentRunner } from "./process-agent-runner";
import type { NewEntity, ProcessRecord, ProcessStore, StepRecord } from "./process-store";
import { runStep, StepFailure, validInstant, type StepPayload } from "./process-step-common";
import type { CreateAgent } from "./process-steps";

export type { StepPayload };

const NOTE_PREVIEW_CHARS = 200;

/**
 * Executa um passo de criacao: o agente extrai os itens do pedido (sem consultar nada), o servidor valida,
 * grava a propria entidade num commit proprio e, na mesma transacao, registra o passo e enfileira a
 * finalizacao. Falha vira passo vermelho: nunca pergunta e nunca refaz o passo.
 */
export class ProcessStepWorker {
  constructor(
    private readonly deps: {
      store: ProcessStore;
      runner: ProcessAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository; recurrences?: RecurrenceRepository };
      createEvent: CreateEventUseCase;
    },
  ) {}

  async run(agent: CreateAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ process, step, timings }) => {
      const session = new AgentChangeSession(
        process.userId, this.deps.repositories, this.deps.createEvent, () => process.createdAt,
      ).keepUnlinkedMeals();
      const started = performance.now();
      const entities = await this.stage(agent, process, step, session, signal);
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      if (entities.length === 0) throw new StepFailure("empty");

      if (getCurrentAiJob()) setAiJobResult({ stepId: step.id });
      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, {
          processId: process.id, stepId: step.id, entities, timings,
        }),
      });
    });
  }

  private async stage(
    agent: CreateAgent,
    process: ProcessRecord,
    step: StepRecord,
    session: AgentChangeSession,
    signal?: AbortSignal,
  ): Promise<NewEntity[]> {
    const user = describeRequest(process.prompt, step.expected, process.context, step.input?.instruction);
    const base = { agent, now: process.createdAt, user, signal };
    switch (agent) {
      case "event-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: eventCreateOutput });
        return this.stageEvents(session, value);
      }
      case "task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: taskCreateOutput });
        return this.stageTasks(session, value);
      }
      case "note-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: noteCreateOutput });
        return this.stageNotes(session, value, process.createdAt);
      }
      case "recurring-event-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: recurringEventCreateOutput });
        const today = session.todayIn(TIME_ZONE);
        return this.stageSeries(session, value.series.map((series) => ({
          name: series.name, input: () => eventSeriesInput(series, today, TIME_ZONE),
        })));
      }
      case "recurring-task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: recurringTaskCreateOutput });
        const today = session.todayIn(TIME_ZONE);
        return this.stageSeries(session, value.series.map((series) => ({
          name: series.name, input: () => taskSeriesInput(series, today, TIME_ZONE),
        })));
      }
    }
  }

  /**
   * Cada serie nova entra com a primeira ocorrencia no mesmo lote (e uma linha de verdade, que a caixa de
   * processo mostra). O template nao traz notas, nem a de refeicao.
   */
  private async stageSeries(
    session: AgentChangeSession,
    series: ReadonlyArray<{ name: string; input: () => CreateRecurrenceInput }>,
  ): Promise<NewEntity[]> {
    for (const item of series) {
      let input: CreateRecurrenceInput;
      try {
        input = item.input();
      } catch (error) {
        if (error instanceof RuleError) throw new StepFailure("rejected");
        throw error;
      }
      const result = await session.createRecurrence(input, { derivedNotes: false });
      if (!result.ok) throw new StepFailure("rejected");
    }
    const { created } = await session.result();
    return created.flatMap((item): NewEntity[] =>
      item.kind === "event" || item.kind === "task"
        ? [{
          kind: item.kind, id: item.id, operation: "create",
          summary: { name: item.name, series: true, ...(item.kind === "event" ? { eventKind: item.eventKind } : {}) },
        }]
        : []);
  }

  private async stageEvents(session: AgentChangeSession, output: EventCreateOutput): Promise<NewEntity[]> {
    const entities: NewEntity[] = [];
    for (const item of output.events) {
      const startedAt = validInstant(item.startedAt);
      const finishedAt = validInstant(item.finishedAt);
      const result = await session.createEvent({
        name: item.name,
        kind: item.kind,
        startedAt,
        finishedAt,
        description: item.description ?? undefined,
        tags: item.tags,
      }, { derivedNotes: false });
      if (!result.ok) throw new StepFailure("rejected");
      entities.push({
        kind: "event", id: result.id, operation: "create",
        summary: { name: item.name, eventKind: item.kind, startedAt, finishedAt },
      });
    }
    return entities;
  }

  private async stageTasks(session: AgentChangeSession, output: TaskCreateOutput): Promise<NewEntity[]> {
    const entities: NewEntity[] = [];
    for (const item of output.tasks) {
      const finishAt = validInstant(item.estimatedFinishAt);
      const result = await session.createTask({
        name: item.name,
        description: item.description ?? undefined,
        priority: item.priority ?? undefined,
        status: item.status ?? undefined,
        tags: item.tags,
        estimatedFinishAt: finishAt ? new Date(finishAt) : undefined,
      });
      if (!result.ok) throw new StepFailure("rejected");
      entities.push({ kind: "task", id: result.id, operation: "create", summary: { name: item.name } });
    }
    return entities;
  }

  private async stageNotes(session: AgentChangeSession, output: NoteCreateOutput, now: Date): Promise<NewEntity[]> {
    const entities: NewEntity[] = [];
    for (const item of output.notes) {
      const text = item.content.slice(0, NOTE_PREVIEW_CHARS);
      if (item.type === "meal") {
        const note = await session.buildNote({ type: "meal", name: item.name, data: { inputText: item.content } }, now);
        session.stageNewNote(note);
        entities.push({
          kind: "note", id: note.id, operation: "create", summary: { name: item.name, noteType: "meal", text },
        });
        continue;
      }
      const result = await session.createNote({ name: item.name, content: item.content });
      if (!result.ok) throw new StepFailure("rejected");
      entities.push({
        kind: "note", id: result.id, operation: "create", summary: { name: item.name, noteType: "text", text },
      });
    }
    return entities;
  }
}
