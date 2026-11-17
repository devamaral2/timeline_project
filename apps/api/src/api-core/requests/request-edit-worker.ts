import type { z } from "zod";
import type { EntityBatchWriter, ScopedSqlQuery } from "../../domain/ports";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import { TIME_ZONE } from "../agent/time";
import type { CreateTaskUseCase } from "../tasks/create-task.usecase";
import type { PlaceResolver } from "../tasks/services/place-resolver.service";
import {
  artifactEditOutput, taskEditOutput, recurringTaskEditOutput,
  type ArtifactEditOutput, type TaskEditOutput, type RecurringTaskEditOutput,
} from "./request-agent-schemas";
import { describeEditRequest, type RequestAgentRunner } from "./request-agent-runner";
import type { EditCandidate } from "./request-candidates";
import type { StepRepositories } from "./request-create-worker";
import { changesNothing, planSeriesEdit, RuleError } from "./request-recurrence";
import { runStep, StepFailure, validInstant, type StepPayload } from "./request-step-common";
import type { EditAgent } from "./request-steps";
import type { NewEntity, RequestRecord, RequestStore, StepRecord } from "./request-store";
import { askTarget } from "./request-target-edit";

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
export class RequestEditWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      runner: RequestAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createTask: CreateTaskUseCase;
      sql: ScopedSqlQuery;
      /** Troca o lugar dito pelo endereco de um lugar que existe. Sem ele, o local fica como foi dito. */
      places?: Pick<PlaceResolver, "resolve">;
    },
  ) {}

  async run(agent: EditAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createTask, () => request.createdAt,
      );
      const started = performance.now();
      switch (agent) {
        case "task-edit":
          await this.applyTasks(
            session, await this.gather(agent, taskEditOutput, request, step, signal),
          );
          break;
        case "artifact-edit":
          await this.applyArtifacts(session, await this.gather(agent, artifactEditOutput, request, step, signal));
          break;
        case "recurring-task-edit":
          await this.applySeries(
            session, await this.gather(agent, recurringTaskEditOutput, request, step, signal),
          );
          break;
      }
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();

      const entities = this.entitiesOf(session, agent === "recurring-task-edit");
      if (entities.length === 0) throw new StepFailure("nothing_to_change");
      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings }),
      });
    });
  }

  /** Pergunta ao agente; se nenhum candidato serve e ele pediu uma consulta, executa e pergunta de novo. */
  private async gather<T extends WithEdits>(
    agent: EditAgent,
    schema: z.ZodType<T>,
    request: RequestRecord,
    step: StepRecord,
    signal?: AbortSignal,
  ): Promise<T["edits"]> {
    // Tela de detalhe: o alvo e conhecido, entao nao ha candidatos nem consulta (ADR 006).
    if (step.input?.target) return askTarget(this.deps.runner, agent, schema, request, step, signal) as Promise<T["edits"]>;
    const candidates: readonly EditCandidate[] = step.input?.candidates ?? [];
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const ask = (lookup?: Lookup) => this.deps.runner.run({
      agent, now: request.createdAt, schema, signal, stepId: step.id,
      user: describeEditRequest(request.prompt, step.expected, request.context, candidates, lookup),
    });

    let { value } = await ask();
    if (value.edits.length === 0 && value.query) {
      const outcome = await this.deps.sql.run({ userId: request.userId, sql: value.query.sql });
      if (!outcome.ok) throw new StepFailure("query_rejected");
      for (const id of idsIn(outcome)) allowed.add(id);
      ({ value } = await ask(outcome));
    }
    if (value.edits.length === 0) throw new StepFailure("not_found");
    if (value.edits.some((edit) => !allowed.has(edit.id))) throw new StepFailure("target_unknown");
    return value.edits;
  }

  /**
   * O lugar novo e procurado no mapa; `""` tira o local. As subtarefas novas nascem no mesmo lote, a fazer quando o
   * agente nao deu status, e entram sob a tarefa editada, depois das que ela ja tinha.
   */
  private async applyTasks(
    session: AgentChangeSession, edits: TaskEditOutput["edits"],
  ): Promise<void> {
    for (const edit of edits) {
      const said = edit.location?.trim();
      const location = said ? await (this.deps.places?.resolve(said) ?? said) : said;
      const changes = {
        name: edit.name ?? undefined, kind: edit.kind ?? undefined, status: edit.status ?? undefined,
        priority: edit.priority ?? undefined, description: edit.description ?? undefined, tags: edit.tags ?? undefined,
        startedAt: date(edit.startedAt), estimatedFinishAt: date(edit.estimatedFinishAt), finishedAt: date(edit.finishedAt),
        location,
      };
      if (Object.values(changes).some((value) => value !== undefined)) {
        const result = await session.reviseTask(edit.id, (current) => current.revise(changes));
        if (!result.ok) throw new StepFailure("rejected");
      }
      for (const subtask of edit.subtasks) {
        const created = await session.createTask({
          name: subtask.name,
          kind: "common",
          status: subtask.status ?? "todo",
          priority: subtask.priority ?? undefined,
          startedAt: validInstant(subtask.startedAt),
          estimatedFinishAt: validInstant(subtask.estimatedFinishAt),
          description: subtask.description ?? undefined,
        }, { derivedArtifacts: false });
        if (!created.ok) throw new StepFailure("rejected");
        const linked = await session.addSubtask(edit.id, created.id);
        if (!linked.ok) throw new StepFailure("rejected");
      }
    }
  }

  private async applyArtifacts(session: AgentChangeSession, edits: ArtifactEditOutput["edits"]): Promise<void> {
    for (const edit of edits) {
      const changes = { name: edit.name ?? undefined, content: edit.content ?? undefined, tags: edit.tags ?? undefined };
      if (Object.values(changes).every((value) => value === undefined)) continue;
      const result = await session.updateArtifact(edit.id, changes);
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  /**
   * A serie e alterada de hoje em diante: as ocorrencias futuras que ninguem mexeu a mao saem e a primeira da
   * regra nova entra neste lote. O template nunca traz artefatos novos; os da serie ficam. O lugar novo e
   * procurado no mapa; `""` tira o local.
   */
  private async applySeries(
    session: AgentChangeSession, edits: RecurringTaskEditOutput["edits"],
  ): Promise<void> {
    for (const asked of edits) {
      if (changesNothing(asked)) continue;
      const said = asked.location?.trim();
      const edit = said ? { ...asked, location: await (this.deps.places?.resolve(said) ?? said) } : asked;
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
        { derivedArtifacts: false },
      );
      if (!result.ok) throw new StepFailure("rejected");
    }
  }

  /**
   * O que o passo alterou. Numa serie, a ocorrencia que a mudanca mostra (nova no banco, mas fruto de uma edicao).
   * Fora da serie, o que nasceu no passo sao as subtarefas novas: entram como criadas, depois das alteradas.
   */
  private entitiesOf(session: AgentChangeSession, series: boolean): NewEntity[] {
    const { created, updated } = session.result();
    if (series) {
      return [...created, ...updated].filter((item) => item.kind === "task").map((item): NewEntity => ({ ...item, operation: "update" }));
    }
    return [
      ...updated.map((item): NewEntity => ({ ...item, operation: "update" })),
      ...created.map((item): NewEntity => ({ ...item, operation: "create" })),
    ];
  }
}
