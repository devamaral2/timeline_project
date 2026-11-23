import type { ArtifactRepository, EntityBatchWriter, RecurrenceRepository, ScopedSqlQuery, TaskRepository } from "../../domain/ports";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession, type StagedRef } from "../agent/services/agent-change-session";
import type { CreateTaskUseCase } from "../tasks/create-task.usecase";
import { entityOutput, type EntityOutput } from "./request-agent-schemas";
import { describeEntityRequest, type RequestAgentRunner } from "./request-agent-runner";
import type { EditCandidate } from "./request-candidates";
import {
  applyArtifactEdits, applySeriesEdits, applyTaskEdits, stageNewArtifacts, stageNewSeries, stageNewTasks, type Places,
} from "./request-entity-changes";
import { runStep, StepFailure, type StepPayload } from "./request-step-common";
import { ENTITY_AGENT } from "./request-steps";
import type { LinkRecord, NewEntity, RequestRecord, RequestStore, StepRecord } from "./request-store";

export interface StepRepositories {
  tasks: TaskRepository;
  artifacts: ArtifactRepository;
  recurrences?: RecurrenceRepository;
}

type Lookup = { columns: string[]; rows: unknown[][] };

/** Todo texto de celula que pareca um id: so estes, e os candidatos, podem ser alvo de uma alteracao. */
function idsIn(lookup: Lookup): string[] {
  return lookup.rows.flat().flatMap((cell) => (typeof cell === "string" ? [cell.trim()] : []));
}

/** O que cada lista da resposta pode alterar: os candidatos do tipo dela e o que a consulta trouxe. */
interface Allowed {
  tasks: Set<string>;
  artifacts: Set<string>;
  series: Set<string>;
}

function allowedOf(candidates: readonly EditCandidate[]): Allowed {
  const ids = (kind: EditCandidate["kind"]) => new Set(candidates.filter((candidate) => candidate.kind === kind).map((candidate) => candidate.id));
  return { tasks: ids("task"), artifacts: ids("artifact"), series: ids("recurrence") };
}

const key = (ref: StagedRef) => `${ref.kind}:${ref.id}`;

/**
 * O passo do agente unico de escrita do chat. O JEV so disse que o pedido cria ou atualiza entidades; o agente
 * recebe o pedido e a lista curta do que ja existe e decide tudo: as tarefas, os artefatos de texto e as series
 * novas, o que muda no que ja existe, e a que tarefa cada artefato novo pertence. Se o que ele precisa alterar nao
 * esta na lista, pede UMA consulta de leitura e e chamado de novo com o resultado.
 *
 * O servidor valida, prepara tudo numa sessao so e grava num unico lote, junto com o registro do passo: ou o pedido
 * inteiro entra, ou nada entra. So aceita alterar ids que vieram dos candidatos ou da consulta. Nunca pergunta:
 * falha vira passo vermelho com codigo.
 */
export class RequestEntityWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      runner: RequestAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createTask: CreateTaskUseCase;
      sql: ScopedSqlQuery;
      places?: Places;
    },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createTask, () => request.createdAt,
      );
      const started = performance.now();
      const { output, allowed, lookedUp } = await this.gather(request, step, signal);
      const { entities, links } = await this.stage(session, output, allowed);
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      // Nada a gravar: o que ele procurava nao apareceu na consulta, a mudanca pedida nao muda nada, ou nao havia o que criar.
      if (entities.length === 0) throw new StepFailure(lookedUp ? "not_found" : asksChange(output) ? "nothing_to_change" : "empty");

      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: async (tx) => {
          await store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings });
          // O agente ja disse a que tarefa cada artefato pertence: a ligacao nasce com o lote.
          for (const link of links) {
            await store.markFinalized(tx, { kind: "artifact", id: link.from.id, stepId: step.id }, [link]);
          }
        },
      });
    });
  }

  /** Pergunta ao agente; se ele pediu uma consulta, executa e pergunta de novo (uma rodada extra, no maximo). */
  private async gather(
    request: RequestRecord, step: StepRecord, signal?: AbortSignal,
  ): Promise<{ output: EntityOutput; allowed: Allowed; lookedUp: boolean }> {
    const candidates: readonly EditCandidate[] = step.input?.candidates ?? [];
    const allowed = allowedOf(candidates);
    const ask = (lookup?: Lookup) => this.deps.runner.run({
      agent: ENTITY_AGENT, now: request.createdAt, schema: entityOutput, signal, stepId: step.id, model: request.model,
      user: describeEntityRequest(request.prompt, request.context, candidates, lookup),
    });

    let { value } = await ask();
    const lookedUp = value.query !== null;
    if (value.query) {
      const outcome = await this.deps.sql.run({ userId: request.userId, sql: value.query.sql });
      if (!outcome.ok) throw new StepFailure("query_rejected");
      for (const id of idsIn(outcome)) {
        allowed.tasks.add(id);
        allowed.artifacts.add(id);
        allowed.series.add(id);
      }
      ({ value } = await ask(outcome));
    }
    const unknown = value.taskEdits.some((edit) => !allowed.tasks.has(edit.id))
      || value.artifactEdits.some((edit) => !allowed.artifacts.has(edit.id))
      || value.seriesEdits.some((edit) => !allowed.series.has(edit.id));
    if (unknown) throw new StepFailure("target_unknown");
    return { output: value, allowed, lookedUp };
  }

  /**
   * Prepara tudo na sessao, na ordem em que as ligacoes precisam: as criacoes, depois as alteracoes. O que nasce e
   * "criado" e o que ja existia e "alterado"; numa serie alterada, a ocorrencia que a mudanca mostra e nova no
   * banco, mas e fruto de uma edicao.
   */
  private async stage(
    session: AgentChangeSession, output: EntityOutput, allowed: Allowed,
  ): Promise<{ entities: NewEntity[]; links: LinkRecord[] }> {
    const { places } = this.deps;
    const seen = new Set<string>();
    const entities: NewEntity[] = [];
    /** O que a sessao preparou desde a ultima chamada: os criados e os alterados, com a operacao que o pedido mostra. */
    const take = (created: NewEntity["operation"], updated: NewEntity["operation"] = "update") => {
      const result = session.result();
      for (const [refs, operation] of [[result.updated, updated], [result.created, created]] as const) {
        for (const ref of refs) {
          if (seen.has(key(ref))) continue;
          seen.add(key(ref));
          entities.push({ ...ref, operation });
        }
      }
    };

    const tasks = await stageNewTasks(session, output.tasks, places);
    const artifactLinks = await stageNewArtifacts(session, output.artifacts, tasks.ids, allowed.tasks);
    await stageNewSeries(session, output.series, places);
    take("create");

    await applyTaskEdits(session, output.taskEdits, places);
    await applyArtifactEdits(session, output.artifactEdits);
    take("create");

    await applySeriesEdits(session, output.seriesEdits, places);
    take("update");

    const links = [...tasks.links, ...artifactLinks];
    return { entities: besideTheirTask(entities, links), links };
  }
}

/** Cada artefato novo logo depois da tarefa a que pertence: e nessa ordem que o pedido mostra o que gravou. */
function besideTheirTask(entities: readonly NewEntity[], links: readonly LinkRecord[]): NewEntity[] {
  const taskOf = new Map(links.map((link) => [link.from.id, link.to.id]));
  const present = new Set(entities.filter((entity) => entity.kind === "task").map((entity) => entity.id));
  const owned = (entity: NewEntity) => entity.kind === "artifact" && present.has(taskOf.get(entity.id) ?? "");
  return entities.filter((entity) => !owned(entity)).flatMap((entity) => (entity.kind === "task"
    ? [entity, ...entities.filter((other) => owned(other) && taskOf.get(other.id) === entity.id)]
    : [entity]));
}

/** O agente propos alguma alteracao (que pode nao ter mudado nada), e nao so criacoes. */
function asksChange(output: EntityOutput): boolean {
  return output.taskEdits.length + output.artifactEdits.length + output.seriesEdits.length > 0;
}
