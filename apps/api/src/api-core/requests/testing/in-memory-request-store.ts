import type { TokenUsage } from "../../agent/gateways/structured-completion.gateway";
import type { ModelSelection, RequestQueryResult } from "@repo/contracts";
import { isInProgressAgentStatus, isOpenAgentStatus, type Artifact, type Task } from "../../../domain";
import { newOrderedId } from "../../../infrastructure/persistence/requests/request-rows";
import { requestTitleOf } from "../../../infrastructure/persistence/requests/postgres-request.store";
import { personalProjectOf } from "../../projects/testing/in-memory-project.query";
import { stepLabel } from "../request-config";
import { REQUEST_JOBS } from "../request-steps";
import type {
  DispatchRecord, EntitySummary, FailedStep, LinkRecord, NewEntity, NewRequest, NewStep, RequestEntityRecord,
  RequestOutcome, RequestRecord, RequestStore, StepRecord, StepThought,
} from "../request-store";

/**
 * O `RequestStore` em memoria: o que o Postgres grava na mesma transacao aqui fica em listas conferiveis. O
 * resumo de cada entidade tocada e lido de `entities`, o mesmo banco em memoria dos testes de tarefas.
 */
export class InMemoryRequestStore implements RequestStore {
  readonly requests = new Map<string, RequestRecord>();
  readonly stepRecords: StepRecord[] = [];
  /** As relacoes que partem de um passo (ou do pedido, na voz) para o que ele tocou. */
  readonly touched: Array<NewEntity & { requestId: string; stepId: string }> = [];
  readonly finalized: Array<{ kind: string; id: string; links: LinkRecord[] }> = [];
  /** Os jobs que o Postgres enfileiraria: o que comeca o pedido, um por passo e um `finalize` por passo terminado. */
  readonly jobs: Array<{ kind: string; requestId: string; stepId?: string }> = [];
  private readonly accepted = new Map<string, string>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly entitySource: { tasks: Task[]; artifacts: Artifact[] } = { tasks: [], artifacts: [] },
  ) {}

  async start(input: NewRequest): Promise<{ requestId: string; created: boolean }> {
    const key = input.clientMessageId ? `${input.userId}:${input.clientMessageId}` : undefined;
    const existing = key ? this.accepted.get(key) : undefined;
    if (existing) return { requestId: existing, created: false };

    const id = newOrderedId();
    if (key) this.accepted.set(key, id);
    this.requests.set(id, {
      id, userId: input.userId, kind: "request", route: input.route, status: "queued",
      title: requestTitleOf(input.text), project: personalProjectOf(input.userId), prompt: input.text,
      ...(input.context ? { context: input.context } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.forceFallback ? { forceFallback: true } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.model ? { model: { ...input.model } } : {}),
      createdAt: this.clock(), updatedAt: this.clock(), failedSteps: [],
    });
    this.jobs.push({ kind: input.job, requestId: id });
    return { requestId: id, created: true };
  }

  /** Atalho de teste: um pedido ja em andamento. */
  seed(partial: Partial<RequestRecord> & Pick<RequestRecord, "id" | "prompt">): RequestRecord {
    const record: RequestRecord = {
      userId: "user-1", kind: "request", route: "steps", status: "running", title: requestTitleOf(partial.prompt),
      project: personalProjectOf(partial.userId ?? "user-1"),
      createdAt: this.clock(), updatedAt: this.clock(), failedSteps: [], ...partial,
    };
    this.requests.set(record.id, record);
    return record;
  }

  /** O pedido que o teste semeou; falha alto se nao existe. */
  require(id: string): RequestRecord {
    const request = this.requests.get(id);
    if (!request) throw new Error(`pedido ${id} nao existe`);
    return request;
  }

  async find(id: string): Promise<RequestRecord | undefined> {
    return this.requests.get(id);
  }

  async list(userId: string, limit: number): Promise<RequestRecord[]> {
    return [...this.requests.values()]
      .filter((request) => request.userId === userId)
      .sort((left, right) => right.id.localeCompare(left.id))
      .slice(0, limit);
  }

  async sessionTurns(userId: string, sessionId: string, limit: number): Promise<RequestRecord[]> {
    return [...this.requests.values()]
      .filter((request) => request.userId === userId && (request.id === sessionId || request.sessionId === sessionId))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(-limit);
  }

  async steps(requestId: string): Promise<StepRecord[]> {
    return this.stepRecords.filter((step) => step.requestId === requestId);
  }

  async entities(requestId: string): Promise<RequestEntityRecord[]> {
    const records = new Map<string, RequestEntityRecord>();
    for (const entity of this.touched.filter((candidate) => candidate.requestId === requestId)) {
      const key = `${entity.kind}:${entity.id}`;
      if (records.has(key)) continue;
      records.set(key, {
        requestId, kind: entity.kind, id: entity.id, stepId: entity.stepId, operation: entity.operation,
        summary: this.summaryOf(entity), finalized: entity.stepId === requestId, links: [],
      });
    }
    for (const mark of this.finalized) {
      const record = records.get(`${mark.kind}:${mark.id}`);
      if (record) record.finalized = true;
      for (const link of mark.links) {
        for (const end of [link.from, link.to]) records.get(`${end.kind}:${end.id}`)?.links.push(link);
      }
    }
    return [...records.values()];
  }

  private summaryOf(entity: Pick<NewEntity, "kind" | "id">): EntitySummary {
    if (entity.kind === "task") {
      const task = this.entitySource.tasks.find((candidate) => candidate.id === entity.id);
      if (!task) return { name: "" };
      return {
        name: task.name, taskKind: task.kind,
        ...(task.startedAt ? { startedAt: task.startedAt.toISOString() } : {}),
        ...(task.estimatedFinishAt ? { estimatedFinishAt: task.estimatedFinishAt.toISOString() } : {}),
        ...(task.occurrence && !task.occurrence.detached ? { series: true } : {}),
      };
    }
    const artifact = this.entitySource.artifacts.find((candidate) => candidate.id === entity.id);
    if (!artifact) return { name: "" };
    const data = artifact.data as { body?: string; description?: string };
    const text = (data.body ?? data.description ?? "").slice(0, 200);
    return { name: artifact.name, artifactType: artifact.type, ...(text ? { text } : {}) };
  }

  async markRunning(requestId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (request?.status === "queued") request.status = "running";
  }

  async beginSteps(requestId: string, steps: readonly NewStep[], dispatch?: DispatchRecord): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || !isOpenAgentStatus(request.status)) return;
    this.insertSteps(requestId, steps);
    if (dispatch) request.dispatch = dispatch;
    request.status = "running";
  }

  async handToHermes(requestId: string, dispatch: DispatchRecord): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || !isOpenAgentStatus(request.status)) return;
    request.route = "hermes";
    request.dispatch = dispatch;
    this.jobs.push({ kind: REQUEST_JOBS.hermes, requestId });
  }

  async handToModel(requestId: string, dispatch: DispatchRecord, model: ModelSelection): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || !isOpenAgentStatus(request.status)) return;
    request.route = "model";
    request.model = model;
    request.dispatch = dispatch;
    this.jobs.push({ kind: REQUEST_JOBS.model, requestId });
  }

  private insertSteps(requestId: string, steps: readonly NewStep[]): void {
    for (const step of steps) {
      this.stepRecords.push({
        id: step.id, requestId, agent: step.agent, label: stepLabel(step.agent), expected: step.expected,
        status: "queued", ...(step.input ? { input: step.input } : {}),
      });
      this.jobs.push({ kind: REQUEST_JOBS.step, requestId, stepId: step.id });
    }
  }

  async markStepRunning(stepId: string): Promise<void> {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (step && isInProgressAgentStatus(step.status)) {
      if (step.status === "queued") step.startedAt = this.clock();
      step.status = "running";
    }
  }

  async recordThought(stepId: string, thought: StepThought): Promise<void> {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (step) step.thoughts = [...(step.thoughts ?? []), thought];
  }

  async recordUsage(stepId: string, usage: TokenUsage): Promise<void> {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (step) step.usage = { input: (step.usage?.input ?? 0) + usage.input, output: (step.usage?.output ?? 0) + usage.output };
  }

  async recordStepSuccess(_tx: unknown, input: {
    requestId: string; stepId: string; entities: readonly NewEntity[]; timings: Record<string, number>;
  }): Promise<void> {
    if (!this.closeStep(input.stepId, "done", input.timings)) throw new Error("Step is no longer open");
    for (const entity of input.entities) this.touched.push({ ...entity, requestId: input.requestId, stepId: input.stepId });
    this.jobs.push({ kind: REQUEST_JOBS.finalize, requestId: input.requestId, stepId: input.stepId });
  }

  async recordQueryResult(input: {
    requestId: string; stepId: string; result: RequestQueryResult; timings: Record<string, number>;
  }): Promise<void> {
    if (!this.closeStep(input.stepId, "done", input.timings)) return;
    this.stepOf(input.stepId).result = input.result;
    this.jobs.push({ kind: REQUEST_JOBS.finalize, requestId: input.requestId, stepId: input.stepId });
  }

  async failStep(input: { requestId: string; stepId: string; errorCode: string; timings?: Record<string, number> }): Promise<void> {
    if (!this.closeStep(input.stepId, "failed", input.timings)) return;
    this.stepOf(input.stepId).errorCode = input.errorCode;
    this.jobs.push({ kind: REQUEST_JOBS.finalize, requestId: input.requestId, stepId: input.stepId });
  }

  private closeStep(stepId: string, status: "done" | "failed", timings?: Record<string, number>): boolean {
    const step = this.stepOf(stepId);
    if (!isInProgressAgentStatus(step.status)) return false;
    step.status = status;
    step.finishedAt = this.clock();
    if (timings) step.timings = timings;
    return true;
  }

  async markFinalized(
    _tx: unknown | undefined,
    entity: Pick<RequestEntityRecord, "kind" | "id" | "stepId">,
    links: readonly LinkRecord[],
  ): Promise<void> {
    this.finalized.push({ kind: entity.kind, id: entity.id, links: [...links] });
  }

  async finish(requestId: string, status: "done" | "failed", outcome: RequestOutcome): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || !isOpenAgentStatus(request.status)) return;
    request.status = status;
    request.finishedAt = this.clock();
    request.updatedAt = this.clock();
    if (outcome.failedSteps?.length) request.failedSteps = outcome.failedSteps;
    if (outcome.errorCode) request.errorCode = outcome.errorCode;
    if (outcome.message) request.answer = outcome.message;
    if (outcome.thought) request.answerThought = outcome.thought;
    if (outcome.trace) request.trace = outcome.trace;
  }

  async completeVoice(_tx: unknown, input: { requestId: string; taskId: string }): Promise<void> {
    const request = this.requests.get(input.requestId);
    if (!request || !isOpenAgentStatus(request.status)) throw new Error("Request is no longer open");
    this.touched.push({ kind: "task", id: input.taskId, operation: "create", requestId: input.requestId, stepId: input.requestId });
    await this.finish(input.requestId, "done", {});
  }

  async cancel(requestId: string): Promise<string[]> {
    const request = this.requests.get(requestId);
    if (!request || !isOpenAgentStatus(request.status)) return [];
    request.status = "cancel";
    request.errorCode = "cancelled";
    request.finishedAt = this.clock();
    const steps = this.stepRecords.filter((step) => step.requestId === requestId);
    for (const step of steps) if (isInProgressAgentStatus(step.status)) step.status = "cancel";
    return [requestId, ...steps.map((step) => step.id)];
  }

  private stepOf(stepId: string): StepRecord {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`passo ${stepId} nao existe`);
    return step;
  }
}
