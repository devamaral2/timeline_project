import { EntityBatchConflictError } from "../../domain";
import type { EntityBatchWriter } from "../../domain/ports";
import { jobContext } from "../../infrastructure/jobs/job-context";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { isAccepted, type JevClient } from "./jev.client";
import { failureExplanationOutput } from "./request-agent-schemas";
import type { RequestAgentRunner } from "./request-agent-runner";
import { linkConfig, stepLabel } from "./request-config";
import type { StepRepositories } from "./request-create-worker";
import { nextLoopRound } from "./request-fallback-loop";
import type { StepPayload } from "./request-step-common";
import type { EntityKind } from "./request-steps";
import type { LinkRecord, RequestEntityRecord, RequestRecord, RequestStore, StepRecord } from "./request-store";

const LINK_ATTEMPTS = 3;

/** So um artefato e uma tarefa se ligam: dois artefatos nao, e a ordem entre duas tarefas nao e decidida aqui. */
export function linkable(a: { kind: EntityKind }, b: { kind: EntityKind }): boolean {
  return a.kind !== b.kind;
}

/** Quem pertence a quem: o artefato pertence à tarefa. */
export function orient<A extends { kind: EntityKind }, B extends { kind: EntityKind }>(
  entity: A,
  chosen: B,
): { from: A | B; to: A | B } {
  return entity.kind === "task" ? { from: chosen, to: entity } : { from: entity, to: chosen };
}

function alreadyLinked(a: RequestEntityRecord, b: RequestEntityRecord): boolean {
  const same = (link: LinkRecord) =>
    (link.from.id === a.id && link.to.id === b.id) || (link.from.id === b.id && link.to.id === a.id);
  return a.links.some(same) || b.links.some(same);
}

function describe(entity: RequestEntityRecord): string {
  const { summary } = entity;
  const label = entity.kind === "task" ? `tarefa (${summary.taskKind ?? "common"})` : `artefato (${summary.artifactType ?? "text"})`;
  return [
    `${label}: ${summary.name}`,
    summary.startedAt ? `início ${summary.startedAt}` : undefined,
    summary.text ? `conteúdo: ${summary.text}` : undefined,
  ].filter(Boolean).join("; ");
}

/**
 * A fila de finalizacao (um job por vez por pedido). Cada entidade concluida e comparada, pelo JEV, com as ja
 * criadas no mesmo pedido; se pertencem uma a outra, liga. Nao espera os outros passos: atualiza a cada elemento
 * concluido, e fecha o pedido quando todos terminaram. No laco do fallback, em vez de fechar, enfileira a rodada
 * seguinte.
 */
export class RequestFinalizer {
  constructor(
    private readonly deps: {
      store: RequestStore;
      jev: JevClient;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createEvent: CreateEventUseCase;
      /** Explica o que falhou quando algum passo falha; sem ele, a caixa do pedido usa a linha predefinida. */
      runner?: RequestAgentRunner;
    },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    const request = await store.find(payload.requestId);
    if (!request || (request.status !== "running" && request.status !== "queued")) return;

    const entities = await store.entities(request.id);
    const fresh = entities.filter((entity) => entity.stepId === payload.stepId && !entity.finalized);
    for (const entity of fresh) {
      signal?.throwIfAborted();
      await this.finalizeEntity(request, entity, entities, signal);
    }
    await this.closeIfDone(request);
  }

  private async finalizeEntity(
    request: RequestRecord,
    entity: RequestEntityRecord,
    entities: readonly RequestEntityRecord[],
    signal?: AbortSignal,
  ): Promise<void> {
    // Uma serie vale para todos os dias dela: ligar a ocorrencia de um dia seria enganoso. O que foi apagado nao se liga.
    const loose = (candidate: RequestEntityRecord) => !candidate.summary.series && candidate.operation !== "delete";
    const candidates = !loose(entity) ? [] : entities
      .filter((other) => !(other.kind === entity.kind && other.id === entity.id) && loose(other))
      .filter((other) => linkable(entity, other) && !alreadyLinked(entity, other))
      .slice(-linkConfig.maxCandidates);

    const chosen = candidates.length > 0 ? await this.choose(request, entity, candidates, signal) : undefined;
    if (!chosen) {
      await this.deps.store.markFinalized(undefined, entity, []);
      return;
    }

    const { from, to } = orient(entity, chosen);
    const link: LinkRecord = { from: { kind: from.kind, id: from.id }, to: { kind: to.kind, id: to.id } };
    for (let attempt = 1; attempt <= LINK_ATTEMPTS; attempt += 1) {
      try {
        await this.applyLink(request, from, to, link, entity);
        return;
      } catch (error) {
        if (error instanceof EntityBatchConflictError && attempt < LINK_ATTEMPTS) continue;
        console.warn("[RequestFinalizer] link not applied", { error: error instanceof Error ? error.name : "unknown" });
        // Cada entidade subsiste sem a ligacao: a falha em ligar nunca desfaz o que o passo criou.
        break;
      }
    }
    await this.deps.store.markFinalized(undefined, entity, []);
  }

  /** O JEV escolhe, entre os candidatos e "nenhum", a entidade a que esta pertence; incerto = nenhum. */
  private async choose(
    request: RequestRecord,
    entity: RequestEntityRecord,
    candidates: readonly RequestEntityRecord[],
    signal?: AbortSignal,
  ): Promise<RequestEntityRecord | undefined> {
    const refs = new Map(candidates.map((candidate, index) => [`c${index + 1}`, candidate]));
    const criteria: Record<string, string> = { none: linkConfig.question.none };
    for (const [ref, candidate] of refs) criteria[ref] = describe(candidate);
    try {
      const result = await this.deps.jev.ask(linkConfig, {
        message: request.prompt,
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

  /**
   * A relacao pertence à tarefa: o artefato passa a aparecer nela (criado pelo pedido, a tarefa o cria; ja
   * existente, a tarefa o usa).
   */
  private async applyLink(
    request: RequestRecord,
    from: RequestEntityRecord,
    to: RequestEntityRecord,
    link: LinkRecord,
    finalized: RequestEntityRecord,
  ): Promise<void> {
    const session = new AgentChangeSession(
      request.userId, this.deps.repositories, this.deps.createEvent, () => request.createdAt,
    );
    const staged = await session.linkArtifact(from.id, to.id, from.operation === "create" ? "creates" : "uses");
    if (!staged.ok) throw new Error(staged.error);
    // Esta finalizacao pode gravar varias vezes (uma por entidade) ou nenhuma: quem conclui o job e a fila,
    // nao o primeiro commit. Fora do contexto do job, o escritor nao o conclui.
    await jobContext.exit(() => this.deps.batchWriter.commit({
      ...session.toBatch(),
      afterWrite: (tx) => this.deps.store.markFinalized(tx, finalized, [link]),
    }));
  }

  private async closeIfDone(request: RequestRecord): Promise<void> {
    const { store } = this.deps;
    const [steps, entities] = await Promise.all([store.steps(request.id), store.entities(request.id)]);
    const open = steps.some((step) => step.status === "queued" || step.status === "running");
    if (open || entities.some((entity) => !entity.finalized)) return;
    // Laco do fallback (`fallback:`): os especialistas da rodada terminaram; quem decide o fim e a rodada seguinte.
    const round = nextLoopRound(steps);
    if (round) {
      await store.continueFallback(request.id, round);
      return;
    }
    const failed = steps.filter((step) => step.status === "failed");
    const failedSteps = failed.map((step) => ({ agent: step.agent, errorCode: step.errorCode ?? "internal" }));
    const explained = failed.length > 0 ? await this.explain(request, steps) : undefined;
    await store.finish(request.id, failed.length === steps.length ? "failed" : "done", {
      failedSteps,
      ...(explained ? { message: explained.message } : {}),
      ...(explained?.reasoning ? { thought: explained.reasoning } : {}),
    });
  }

  /** So em caso de falha, uma chamada curta diz o que falhou. Se ela mesma falha, vale a linha predefinida. */
  private async explain(
    request: RequestRecord,
    steps: readonly StepRecord[],
  ): Promise<{ message: string; reasoning?: string } | undefined> {
    const { runner } = this.deps;
    if (!runner) return undefined;
    const line = (step: StepRecord) => `- ${stepLabel(step.agent)}${step.errorCode ? ` (código: ${step.errorCode})` : ""}`;
    try {
      const { value, reasoning } = await runner.run({
        agent: "failure-explainer", now: request.createdAt, schema: failureExplanationOutput,
        user: [
          "Pedido:", request.prompt, "",
          "Passos que falharam:", ...steps.filter((step) => step.status === "failed").map(line), "",
          "Passos que deram certo:", ...(steps.some((step) => step.status === "done")
            ? steps.filter((step) => step.status === "done").map(line)
            : ["- nenhum"]),
        ].join("\n"),
      });
      return { message: value.message, ...(reasoning ? { reasoning } : {}) };
    } catch {
      return undefined;
    }
  }
}
