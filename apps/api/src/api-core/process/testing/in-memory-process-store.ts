import type {
  LinkRecord, NewEntity, NewStep, ProcessEntityRecord, ProcessRecord, ProcessResponse, ProcessStore, QueryResult, StepRecord,
} from "../process-store";
import type { AgentScreenContext } from "@repo/contracts";

/** O `ProcessStore` em memoria: o que o Postgres grava na mesma transacao aqui fica em listas conferiveis. */
export class InMemoryProcessStore implements ProcessStore {
  readonly processes = new Map<string, ProcessRecord>();
  readonly stepRecords: StepRecord[] = [];
  readonly entityRecords: ProcessEntityRecord[] = [];
  /** Jobs que o Postgres enfileiraria: `dispatch`, um por passo e um `finalize` por passo concluido. */
  readonly jobs: Array<{ kind: string; processId: string; stepId?: string }> = [];
  /** O payload dos jobs `process-edit-target` que o Postgres enfileiraria. */
  readonly editJobs: Array<{ processId: string; entityType: string; entityId: string }> = [];
  dispatch: unknown;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async start(input: { id: string; userId: string; actorId: string; prompt: string; context?: AgentScreenContext }): Promise<void> {
    this.processes.set(input.id, {
      id: input.id, userId: input.userId, actorId: input.actorId, prompt: input.prompt, context: input.context,
      status: "dispatching", createdAt: this.clock(),
    });
    this.jobs.push({ kind: "process-dispatch", processId: input.id });
  }

  async startEdit(input: { id: string; userId: string; actorId: string; prompt: string; entityType: string; entityId: string }): Promise<void> {
    this.processes.set(input.id, {
      id: input.id, userId: input.userId, actorId: input.actorId, prompt: input.prompt,
      status: "dispatching", createdAt: this.clock(),
    });
    this.editJobs.push({ processId: input.id, entityType: input.entityType, entityId: input.entityId });
    this.jobs.push({ kind: "process-edit-target", processId: input.id });
  }

  /** Atalho de teste: um processo ja em andamento. */
  seed(partial: Partial<ProcessRecord> & Pick<ProcessRecord, "id" | "prompt">): ProcessRecord {
    const record: ProcessRecord = {
      userId: "user-1", actorId: "user-1", status: "running", createdAt: this.clock(), ...partial,
    };
    this.processes.set(record.id, record);
    return record;
  }

  /** O processo que o teste semeou; falha alto se nao existe. */
  require(id: string): ProcessRecord {
    const process = this.processes.get(id);
    if (!process) throw new Error(`processo ${id} nao existe`);
    return process;
  }

  async find(id: string): Promise<ProcessRecord | undefined> {
    return this.processes.get(id);
  }

  async steps(processId: string): Promise<StepRecord[]> {
    return this.stepRecords.filter((step) => step.processId === processId);
  }

  async entities(processId: string): Promise<ProcessEntityRecord[]> {
    return this.entityRecords.filter((entity) => entity.processId === processId);
  }

  async beginSteps(processId: string, steps: readonly NewStep[], dispatch: unknown): Promise<void> {
    for (const step of steps) {
      this.stepRecords.push({
        id: step.id, processId, agent: step.agent, expected: step.expected, status: "pending", input: step.input,
      });
      this.jobs.push({ kind: `process-${step.agent}`, processId, stepId: step.id });
    }
    this.dispatch = dispatch;
    const process = this.processes.get(processId);
    if (process?.status === "dispatching") process.status = "running";
  }

  async handOff(processId: string, fallbackStepId: string, steps: readonly NewStep[]): Promise<void> {
    for (const step of steps) {
      this.stepRecords.push({
        id: step.id, processId, agent: step.agent, expected: step.expected, status: "pending", input: step.input,
      });
      this.jobs.push({ kind: `process-${step.agent}`, processId, stepId: step.id });
    }
    this.stepOf(fallbackStepId).status = "succeeded";
  }

  async markStepRunning(stepId: string): Promise<void> {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (step && (step.status === "pending" || step.status === "running")) step.status = "running";
  }

  async recordStepSuccess(_tx: unknown, input: {
    processId: string; stepId: string; entities: readonly NewEntity[]; timings: Record<string, number>;
  }): Promise<void> {
    for (const entity of input.entities) {
      this.entityRecords.push({
        processId: input.processId, kind: entity.kind, id: entity.id, stepId: input.stepId,
        operation: entity.operation, summary: entity.summary, finalized: false, links: [],
      });
    }
    this.stepOf(input.stepId).status = "succeeded";
    this.jobs.push({ kind: "process-finalize", processId: input.processId, stepId: input.stepId });
  }

  async recordQueryResult(input: { processId: string; stepId: string; result: QueryResult }): Promise<void> {
    const step = this.stepOf(input.stepId);
    step.status = "succeeded";
    step.result = input.result;
    this.jobs.push({ kind: "process-finalize", processId: input.processId, stepId: input.stepId });
  }

  async failStep(input: { processId: string; stepId: string; errorCode: string }): Promise<void> {
    const step = this.stepOf(input.stepId);
    step.status = "failed";
    step.errorCode = input.errorCode;
    this.jobs.push({ kind: "process-finalize", processId: input.processId, stepId: input.stepId });
  }

  async markFinalized(
    _tx: unknown | undefined,
    processId: string,
    entity: { kind: string; id: string },
    links: readonly LinkRecord[],
  ): Promise<void> {
    const record = this.entityRecords.find(
      (candidate) => candidate.processId === processId && candidate.kind === entity.kind && candidate.id === entity.id,
    );
    if (!record) return;
    record.finalized = true;
    record.links = [...record.links, ...links];
    // Os vinculos valem para os dois lados: o outro extremo tambem os enxerga.
    for (const link of links) {
      const other = this.entityRecords.find((candidate) =>
        candidate.processId === processId && candidate.id !== record.id
        && (candidate.id === link.from.id || candidate.id === link.to.id));
      if (other) other.links = [...other.links, link];
    }
  }

  async finish(processId: string, status: "completed" | "failed", response: ProcessResponse): Promise<void> {
    const process = this.processes.get(processId);
    if (process && (process.status === "dispatching" || process.status === "running")) {
      process.status = status;
      process.response = response;
    }
  }

  async finishFallback(processId: string, stepId: string, text: string): Promise<void> {
    this.stepOf(stepId).status = "succeeded";
    await this.finish(processId, "completed", { failedSteps: [], text });
  }

  private stepOf(stepId: string): StepRecord {
    const step = this.stepRecords.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`step ${stepId} nao existe`);
    return step;
  }
}
