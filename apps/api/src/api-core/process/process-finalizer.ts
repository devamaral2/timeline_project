import { EntityBatchConflictError, type EventKind } from "../../domain";
import type { EntityBatchWriter, EventRepository, NoteRepository, RecurrenceRepository, TaskRepository } from "../../domain/ports";
import { aiJobContext } from "../../infrastructure/ai-jobs/ai-job-context";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { isAccepted, type JevProcessClient } from "./jev-process.client";
import { linkConfig } from "./process-config";
import { failureExplanationOutput } from "./process-agent-schemas";
import type { ProcessAgentRunner } from "./process-agent-runner";
import { stepLabel } from "./process-config";
import type { StepPayload } from "./process-step-common";
import type { EntityKind } from "./process-steps";
import type { LinkRecord, ProcessEntityRecord, ProcessRecord, ProcessStore, StepRecord } from "./process-store";

const LINK_ATTEMPTS = 3;

/** Quem aponta para quem: a nota para a tarefa ou o evento, a tarefa para o evento. */
const RANK: Record<EntityKind, number> = { note: 0, task: 1, event: 2 };

export function linkable(a: { kind: EntityKind }, b: { kind: EntityKind }): boolean {
  return a.kind !== b.kind;
}

/** Origem e destino do vinculo entre duas entidades de tipos diferentes. */
export function orient<A extends { kind: EntityKind }, B extends { kind: EntityKind }>(
  a: A,
  b: B,
): { from: A | B; to: A | B } {
  return RANK[a.kind] < RANK[b.kind] ? { from: a, to: b } : { from: b, to: a };
}

function alreadyLinked(a: ProcessEntityRecord, b: ProcessEntityRecord): boolean {
  const same = (link: LinkRecord) =>
    (link.from.id === a.id && link.to.id === b.id) || (link.from.id === b.id && link.to.id === a.id);
  return a.links.some(same) || b.links.some(same);
}

function describe(entity: ProcessEntityRecord): string {
  const { summary } = entity;
  const label = entity.kind === "event" ? `evento (${summary.eventKind ?? "rotina"})`
    : entity.kind === "task" ? "tarefa"
      : `nota (${summary.noteType ?? "texto"})`;
  return [
    `${label}: ${summary.name}`,
    summary.startedAt ? `início ${summary.startedAt}` : undefined,
    summary.text ? `conteúdo: ${summary.text}` : undefined,
  ].filter(Boolean).join("; ");
}

/**
 * A fila de finalizacao (um job por vez por processo). Cada entidade concluida e comparada, pelo JEV,
 * com as ja criadas no mesmo processo; se pertencem uma a outra, vincula. Nao espera os outros passos:
 * atualiza a cada elemento concluido, e fecha o processo quando todos terminaram.
 */
export class ProcessFinalizer {
  constructor(
    private readonly deps: {
      store: ProcessStore;
      jev: JevProcessClient;
      batchWriter: EntityBatchWriter;
      repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository; recurrences?: RecurrenceRepository };
      createEvent: CreateEventUseCase;
      /** Explica o que falhou quando algum passo falha; sem ele, a caixa de processo usa a linha predefinida. */
      runner?: ProcessAgentRunner;
    },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    const process = await store.find(payload.processId);
    if (!process || (process.status !== "running" && process.status !== "dispatching")) return;

    const entities = await store.entities(process.id);
    const fresh = entities.filter((entity) => entity.stepId === payload.stepId && !entity.finalized);
    for (const entity of fresh) {
      signal?.throwIfAborted();
      await this.finalizeEntity(process, entity, entities, signal);
    }
    await this.closeIfDone(process);
  }

  private async finalizeEntity(
    process: ProcessRecord,
    entity: ProcessEntityRecord,
    entities: readonly ProcessEntityRecord[],
    signal?: AbortSignal,
  ): Promise<void> {
    // Uma serie vale para todos os dias dela: vincular a ocorrencia de um dia seria enganoso.
    const candidates = entity.summary.series ? [] : entities
      .filter((other) => !(other.kind === entity.kind && other.id === entity.id) && !other.summary.series)
      .filter((other) => linkable(entity, other) && !alreadyLinked(entity, other))
      .slice(-linkConfig.maxCandidates);

    const chosen = candidates.length > 0 ? await this.choose(process, entity, candidates, signal) : undefined;
    if (!chosen) {
      await this.deps.store.markFinalized(undefined, process.id, entity, []);
      return;
    }

    const { from, to } = orient(entity, chosen);
    const link: LinkRecord = { from: { kind: from.kind, id: from.id }, to: { kind: to.kind, id: to.id } };
    for (let attempt = 1; attempt <= LINK_ATTEMPTS; attempt += 1) {
      try {
        await this.applyLink(process, from, to, [link], entity);
        return;
      } catch (error) {
        if (error instanceof EntityBatchConflictError && attempt < LINK_ATTEMPTS) continue;
        console.warn("[ProcessFinalizer] link not applied", { error: error instanceof Error ? error.name : "unknown" });
        // Cada entidade subsiste sem o vinculo: a falha em vincular nunca desfaz o que o passo criou.
        break;
      }
    }
    await this.deps.store.markFinalized(undefined, process.id, entity, []);
  }

  /** O JEV escolhe, entre os candidatos e "nenhum", a entidade a que esta pertence; incerto = nenhum. */
  private async choose(
    process: ProcessRecord,
    entity: ProcessEntityRecord,
    candidates: readonly ProcessEntityRecord[],
    signal?: AbortSignal,
  ): Promise<ProcessEntityRecord | undefined> {
    const refs = new Map(candidates.map((candidate, index) => [`c${index + 1}`, candidate]));
    const criteria: Record<string, string> = { none: linkConfig.question.none };
    for (const [ref, candidate] of refs) criteria[ref] = describe(candidate);
    try {
      const result = await this.deps.jev.ask(linkConfig, {
        message: process.prompt,
        entity: describe(entity),
      }, { link: { type: "choice", instructions: linkConfig.question.instructions, criteria } }, signal);
      const answer = result.answers.link;
      if (!isAccepted(answer, linkConfig.minCertainty) || answer.choice === "none") return undefined;
      return refs.get(answer.choice);
    } catch (error) {
      if (signal?.aborted) throw error;
      return undefined;
    }
  }

  private async applyLink(
    process: ProcessRecord,
    from: ProcessEntityRecord,
    to: ProcessEntityRecord,
    links: readonly LinkRecord[],
    finalized: ProcessEntityRecord,
  ): Promise<void> {
    const session = new AgentChangeSession(
      process.userId, this.deps.repositories, this.deps.createEvent, () => process.createdAt,
    );
    const staged = from.kind === "note"
      ? await session.updateNote(from.id, to.kind === "event" ? { eventId: to.id } : { taskId: to.id })
      : await session.updateEvent(to.id, (to.summary.eventKind ?? "routine") as EventKind, async (current) =>
        current.revise({ taskIds: [...new Set([...current.taskIds, from.id])] }));
    if (!staged.ok) throw new Error(staged.error);
    // Esta finalizacao pode gravar varias vezes (uma por entidade) ou nenhuma: quem conclui o job e o
    // consumidor, nao o primeiro commit. Fora do contexto do job, o escritor nao o conclui.
    await aiJobContext.exit(() => this.deps.batchWriter.commit({
      ...session.toBatch(),
      afterWrite: (tx) => this.deps.store.markFinalized(tx, process.id, finalized, links),
    }));
  }

  private async closeIfDone(process: ProcessRecord): Promise<void> {
    const { store } = this.deps;
    const [steps, entities] = await Promise.all([store.steps(process.id), store.entities(process.id)]);
    const open = steps.some((step) => step.status === "pending" || step.status === "running");
    if (open || entities.some((entity) => !entity.finalized)) return;
    const failed = steps.filter((step) => step.status === "failed");
    const failedSteps = failed.map((step) => ({ agent: step.agent, errorCode: step.errorCode ?? "internal" }));
    const explanation = failed.length > 0 ? await this.explain(process, steps) : undefined;
    await store.finish(process.id, failed.length === steps.length ? "failed" : "completed", {
      failedSteps, ...(explanation ? { explanation } : {}),
    });
  }

  /** So em caso de falha, uma chamada curta diz o que falhou. Se ela mesma falha, vale a linha predefinida. */
  private async explain(process: ProcessRecord, steps: readonly StepRecord[]): Promise<string | undefined> {
    const { runner } = this.deps;
    if (!runner) return undefined;
    const line = (step: StepRecord) => `- ${stepLabel(step.agent)}${step.errorCode ? ` (código: ${step.errorCode})` : ""}`;
    try {
      const { value } = await runner.run({
        agent: "failure-explainer", now: process.createdAt, schema: failureExplanationOutput,
        user: [
          "Pedido:", process.prompt, "",
          "Passos que falharam:", ...steps.filter((step) => step.status === "failed").map(line), "",
          "Passos que deram certo:", ...(steps.some((step) => step.status === "succeeded")
            ? steps.filter((step) => step.status === "succeeded").map(line)
            : ["- nenhum"]),
        ].join("\n"),
      });
      return value.message;
    } catch {
      return undefined;
    }
  }
}
