import type { z } from "zod";
import type { EntityBatchWriter, EventRepository, NoteRepository, RecurrenceRepository, ScopedSqlQuery, TaskRepository } from "../../domain/ports";
import { getCurrentAiJob, setAiJobResult } from "../../infrastructure/ai-jobs/ai-job-context";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import type { EditCandidate } from "./process-candidates";
import { TIME_ZONE } from "../agent/time";
import {
  eventEditOutput, noteEditOutput, recurringEventEditOutput, recurringTaskEditOutput, taskEditOutput,
  type EventEditOutput, type NoteEditOutput, type RecurringEventEditOutput, type RecurringTaskEditOutput,
  type TaskEditOutput,
} from "./process-agent-schemas";
import { askTarget } from "./process-target-edit";
import { changesNothing, planSeriesEdit, RuleError } from "./process-recurrence";
import { describeEditRequest, type ProcessAgentRunner } from "./process-agent-runner";
import { runStep, StepFailure, validInstant, type StepPayload } from "./process-step-common";
import type { EditAgent } from "./process-steps";
import type { NewEntity, ProcessRecord, ProcessStore, StepRecord } from "./process-store";

const NOTE_PREVIEW_CHARS = 200;

type Lookup = { columns: string[]; rows: unknown[][] };
type WithEdits = { edits: Array<{ id: string }>; query: { sql: string } | null };

/** Todo texto de celula que pareca um id: so estes podem ser alvo de uma edicao vinda de consulta. */
function idsIn(lookup: Lookup): string[] {
  return lookup.rows.flat().flatMap((cell) => (typeof cell === "string" ? [cell.trim()] : []));
}

const date = (value: string | null): Date | undefined => {
  const valid = validInstant(value);
  return valid ? new Date(valid) : undefined;
};

/**
 * Executa um passo de edicao. O JEV ja escolheu os candidatos; o agente decide o que muda neles. Se nenhum
 * for o alvo, pode pedir UMA consulta de leitura e e chamado de novo com o resultado (no maximo uma rodada
 * extra). So aceita ids que vieram dos candidatos ou da consulta. Nunca pergunta: alvo nao encontrado vira
 * passo vermelho.
 */
export class ProcessEditWorker {
  constructor(
    private readonly deps: {
      store: ProcessStore;
      runner: ProcessAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository; recurrences?: RecurrenceRepository };
      createEvent: CreateEventUseCase;
      sql: ScopedSqlQuery;
    },
  ) {}

  async run(agent: EditAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ process, step, timings }) => {
      const session = new AgentChangeSession(
        process.userId, this.deps.repositories, this.deps.createEvent, () => process.createdAt,
      );
      const started = performance.now();
      switch (agent) {
        case "event-edit":
          await this.applyEvents(session, await this.gather(agent, eventEditOutput, process, step, signal));
          break;
        case "task-edit":
          await this.applyTasks(session, await this.gather(agent, taskEditOutput, process, step, signal));
          break;
        case "note-edit":
          await this.applyNotes(session, await this.gather(agent, noteEditOutput, process, step, signal));
          break;
        case "recurring-event-edit":
          await this.applySeries(session, await this.gather(agent, recurringEventEditOutput, process, step, signal));
          break;
        case "recurring-task-edit":
          await this.applySeries(session, await this.gather(agent, recurringTaskEditOutput, process, step, signal));
          break;
      }
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();

      const entities = await this.entitiesOf(session, agent === "recurring-event-edit" || agent === "recurring-task-edit");
      if (entities.length === 0) throw new StepFailure("nothing_to_change");
      if (getCurrentAiJob()) setAiJobResult({ stepId: step.id });
      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, { processId: process.id, stepId: step.id, entities, timings }),
      });
    });
  }

  /** Pergunta ao agente; se nenhum candidato serve e ele pediu uma consulta, executa e pergunta de novo. */
  private async gather<T extends WithEdits>(
    agent: EditAgent,
    schema: z.ZodType<T>,
    process: ProcessRecord,
    step: StepRecord,
    signal?: AbortSignal,
  ): Promise<T["edits"]> {
    // Tela de detalhe: o alvo e conhecido, entao nao ha candidatos nem consulta (ADR 006).
    if (step.input?.target) return askTarget(this.deps.runner, agent, schema, process, step, signal) as Promise<T["edits"]>;
    const candidates: readonly EditCandidate[] = step.input?.candidates ?? [];
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const ask = (lookup?: Lookup) => this.deps.runner.run({
      agent, now: process.createdAt, schema, signal,
      user: describeEditRequest(process.prompt, step.expected, process.context, candidates, lookup, step.input?.instruction),
    });

    let { value } = await ask();
    if (value.edits.length === 0 && value.query) {
      const outcome = await this.deps.sql.run({ userId: process.userId, sql: value.query.sql, scope: { includeChat: false } });
      if (!outcome.ok) throw new StepFailure("query_rejected");
      for (const id of idsIn(outcome)) allowed.add(id);
      ({ value } = await ask(outcome));
    }
    if (value.edits.length === 0) throw new StepFailure("not_found");
    if (value.edits.some((edit) => !allowed.has(edit.id))) throw new StepFailure("target_unknown");
    return value.edits;
  }

  private async applyEvents(session: AgentChangeSession, edits: EventEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changes = {
        name: edit.name ?? undefined, kind: edit.kind ?? undefined, description: edit.description ?? undefined,
        tags: edit.tags ?? undefined, startedAt: date(edit.startedAt), finishedAt: date(edit.finishedAt),
      };
      if (Object.values(changes).every((value) => value === undefined)) continue;
      const result = await session.reviseEvent(edit.id, async (current) => current.revise(changes));
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  private async applyTasks(session: AgentChangeSession, edits: TaskEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changes = {
        name: edit.name ?? undefined, description: edit.description ?? undefined, priority: edit.priority ?? undefined,
        status: edit.status ?? undefined, tags: edit.tags ?? undefined, startedAt: date(edit.startedAt),
        estimatedFinishAt: date(edit.estimatedFinishAt), finishedAt: date(edit.finishedAt),
      };
      if (Object.values(changes).every((value) => value === undefined)) continue;
      const result = await session.updateTask(edit.id, changes);
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  private async applyNotes(session: AgentChangeSession, edits: NoteEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changes = { name: edit.name ?? undefined, content: edit.content ?? undefined, tags: edit.tags ?? undefined };
      if (Object.values(changes).every((value) => value === undefined)) continue;
      const result = await session.updateNote(edit.id, changes);
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  /**
   * A serie e alterada de hoje em diante: as ocorrencias futuras que ninguem mexeu a mao saem e a primeira da
   * regra nova entra neste lote. O template nunca traz notas novas; as da serie ficam.
   */
  private async applySeries(
    session: AgentChangeSession,
    edits: RecurringEventEditOutput["edits"] | RecurringTaskEditOutput["edits"],
  ): Promise<void> {
    for (const edit of edits) {
      if (changesNothing(edit)) continue;
      const result = await session.updateRecurrence(
        edit.id,
        (current) => {
          try {
            return planSeriesEdit(current, edit, TIME_ZONE);
          } catch (error) {
            if (error instanceof RuleError) throw new Error(error.message);
            throw error;
          }
        },
        { derivedNotes: false },
      );
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  /** As entidades alteradas, como a finalizacao as mostra ao JEV. Numa serie, a ocorrencia que a mudanca mostra. */
  private async entitiesOf(session: AgentChangeSession, series = false): Promise<NewEntity[]> {
    const { created, updated } = await session.result();
    if (series) {
      return [...created, ...updated].flatMap((item): NewEntity[] =>
        item.kind === "event" || item.kind === "task"
          ? [{
            kind: item.kind, id: item.id, operation: "update",
            summary: { name: item.name, series: true, ...(item.kind === "event" ? { eventKind: item.eventKind } : {}) },
          }]
          : []);
    }
    return updated.map((item): NewEntity => {
      if (item.kind === "event") {
        return {
          kind: "event", id: item.id, operation: "update",
          summary: { name: item.name, eventKind: item.eventKind, startedAt: item.startedAt, finishedAt: item.finishedAt },
        };
      }
      if (item.kind === "task") return { kind: "task", id: item.id, operation: "update", summary: { name: item.name } };
      const body = item.type === "text" ? item.data.body : undefined;
      return {
        kind: "note", id: item.id, operation: "update",
        summary: { name: item.name, noteType: item.type, ...(body ? { text: body.slice(0, NOTE_PREVIEW_CHARS) } : {}) },
      };
    });
  }
}
