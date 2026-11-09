import { sql } from "drizzle-orm";
import type { AgentScreenContext, AiProcessEditEntityType } from "@repo/contracts";
import { jobKindOf } from "../../../api-core/process/process-steps";
import type {
  LinkRecord,
  NewEntity,
  NewStep,
  ProcessEntityRecord,
  ProcessRecord,
  ProcessResponse,
  ProcessStore,
  QueryResult,
  StepRecord,
} from "../../../api-core/process/process-store";
import { enqueueAiJobInTransaction, type AiJobTransaction } from "../../ai-jobs/ai-job-context";
import type { PostgresDatabase } from "../database/postgres-database";

type Row = Record<string, unknown>;

/** Persistencia do processo e dos passos. Os jobs de fila entram sempre na mesma transacao que o estado. */
export class PostgresAiProcessStore implements ProcessStore {
  constructor(private readonly database: PostgresDatabase) {}

  /** A transacao do escritor em lote, ou uma nova. */
  private async inTransaction<T>(tx: unknown | undefined, run: (tx: AiJobTransaction) => Promise<T>): Promise<T> {
    if (tx) return run(tx as AiJobTransaction);
    return this.database.db.transaction((own) => run(own as unknown as AiJobTransaction));
  }

  async start(input: {
    id: string;
    userId: string;
    actorId: string;
    prompt: string;
    context?: AgentScreenContext;
  }): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      await tx.execute(sql`INSERT INTO ai_processes (id,user_id,actor_id,prompt,context)
        VALUES (${input.id},${input.userId},${input.actorId},${input.prompt},${input.context ? JSON.stringify(input.context) : null}::jsonb)`);
      await enqueueAiJobInTransaction(tx, {
        kind: "process-dispatch", userId: input.userId, actorId: input.actorId,
        payload: { processId: input.id }, dedupeKey: input.id,
      });
    });
  }

  async startEdit(input: {
    id: string;
    userId: string;
    actorId: string;
    prompt: string;
    entityType: AiProcessEditEntityType;
    entityId: string;
  }): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      await tx.execute(sql`INSERT INTO ai_processes (id,user_id,actor_id,prompt,context)
        VALUES (${input.id},${input.userId},${input.actorId},${input.prompt},
          ${JSON.stringify({ screen: "detail", entityId: input.entityId })}::jsonb)`);
      await enqueueAiJobInTransaction(tx, {
        kind: "process-edit-target", userId: input.userId, actorId: input.actorId,
        payload: { processId: input.id, entityType: input.entityType, entityId: input.entityId }, dedupeKey: input.id,
      });
    });
  }

  async find(id: string): Promise<ProcessRecord | undefined> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,user_id,actor_id,prompt,context,status,response,created_at FROM ai_processes WHERE id=$1`, [id]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: String(row.id), userId: String(row.user_id), actorId: String(row.actor_id), prompt: String(row.prompt),
      context: (row.context ?? undefined) as AgentScreenContext | undefined,
      status: row.status as ProcessRecord["status"],
      response: (row.response ?? undefined) as ProcessResponse | undefined,
      createdAt: new Date(row.created_at as string | Date),
    };
  }

  async steps(processId: string): Promise<StepRecord[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,process_id,agent,expected,status,error_code,payload,result FROM ai_process_steps
       WHERE process_id=$1 ORDER BY id`, [processId]);
    return rows.map((row) => ({
      id: String(row.id), processId: String(row.process_id), agent: row.agent as StepRecord["agent"],
      expected: row.expected as StepRecord["expected"], status: row.status as StepRecord["status"],
      errorCode: (row.error_code ?? undefined) as string | undefined,
      input: (row.payload ?? undefined) as StepRecord["input"],
      result: (row.result ?? undefined) as QueryResult | undefined,
    }));
  }

  async entities(processId: string): Promise<ProcessEntityRecord[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT process_id,entity_kind,entity_id,step_id,operation,summary,finalized_at,links
       FROM ai_process_entities WHERE process_id=$1 ORDER BY created_at, entity_id`, [processId]);
    return rows.map((row) => ({
      processId: String(row.process_id), kind: row.entity_kind as ProcessEntityRecord["kind"],
      id: String(row.entity_id), stepId: String(row.step_id), operation: row.operation as "create" | "update",
      summary: row.summary as ProcessEntityRecord["summary"], finalized: row.finalized_at !== null,
      links: (row.links ?? []) as LinkRecord[],
    }));
  }

  async beginSteps(processId: string, steps: readonly NewStep[], dispatch: unknown): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      await this.insertSteps(tx, processId, steps);
      await tx.execute(sql`UPDATE ai_processes SET status='running',dispatch=${JSON.stringify(dispatch)}::jsonb
        WHERE id=${processId} AND status='dispatching'`);
    });
  }

  async handOff(processId: string, fallbackStepId: string, steps: readonly NewStep[]): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      await this.insertSteps(tx, processId, steps);
      await tx.execute(sql`UPDATE ai_process_steps SET status='succeeded',finished_at=now() WHERE id=${fallbackStepId}`);
    });
  }

  private async insertSteps(tx: AiJobTransaction, processId: string, steps: readonly NewStep[]): Promise<void> {
    const owner = (await tx.execute(sql`SELECT user_id,actor_id FROM ai_processes WHERE id=${processId}`)).rows[0];
    if (!owner) throw new Error("Process not found");
    for (const step of steps) {
      const jobId = await enqueueAiJobInTransaction(tx, {
        kind: jobKindOf(step.agent), userId: String(owner.user_id), actorId: String(owner.actor_id),
        payload: { processId, stepId: step.id }, dedupeKey: step.id,
      });
      await tx.execute(sql`INSERT INTO ai_process_steps (id,process_id,agent,expected,payload,job_id)
        VALUES (${step.id},${processId},${step.agent},${step.expected},
          ${step.input ? JSON.stringify(step.input) : null}::jsonb,${jobId})`);
    }
  }

  async markStepRunning(stepId: string): Promise<void> {
    await this.database.pool.query(
      `UPDATE ai_process_steps SET status='running',started_at=COALESCE(started_at,now())
       WHERE id=$1 AND status IN ('pending','running')`, [stepId]);
  }

  async recordStepSuccess(tx: unknown, input: {
    processId: string;
    stepId: string;
    entities: readonly NewEntity[];
    timings: Record<string, number>;
  }): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      for (const entity of input.entities) {
        await run.execute(sql`INSERT INTO ai_process_entities (process_id,entity_kind,entity_id,step_id,operation,summary)
          VALUES (${input.processId},${entity.kind},${entity.id},${input.stepId},${entity.operation},${JSON.stringify(entity.summary)}::jsonb)
          ON CONFLICT DO NOTHING`);
      }
      await run.execute(sql`UPDATE ai_process_steps SET status='succeeded',finished_at=now(),
        timings=${JSON.stringify(input.timings)}::jsonb WHERE id=${input.stepId}`);
      await this.enqueueFinalize(run, input.processId, input.stepId);
    });
  }

  async recordQueryResult(input: {
    processId: string;
    stepId: string;
    result: QueryResult;
    timings: Record<string, number>;
  }): Promise<void> {
    await this.inTransaction(undefined, async (run) => {
      await run.execute(sql`UPDATE ai_process_steps SET status='succeeded',finished_at=now(),
        result=${JSON.stringify(input.result)}::jsonb,timings=${JSON.stringify(input.timings)}::jsonb
        WHERE id=${input.stepId}`);
      await this.enqueueFinalize(run, input.processId, input.stepId);
    });
  }

  async failStep(input: { processId: string; stepId: string; errorCode: string; timings?: Record<string, number> }): Promise<void> {
    await this.inTransaction(undefined, async (run) => {
      await run.execute(sql`UPDATE ai_process_steps SET status='failed',error_code=${input.errorCode},finished_at=now(),
        timings=${input.timings ? JSON.stringify(input.timings) : null}::jsonb WHERE id=${input.stepId}`);
      await this.enqueueFinalize(run, input.processId, input.stepId);
    });
  }

  private async enqueueFinalize(tx: AiJobTransaction, processId: string, stepId: string): Promise<void> {
    const owner = (await tx.execute(sql`SELECT user_id,actor_id FROM ai_processes WHERE id=${processId}`)).rows[0];
    if (!owner) throw new Error("Process not found");
    await enqueueAiJobInTransaction(tx, {
      kind: "process-finalize", userId: String(owner.user_id), actorId: String(owner.actor_id),
      payload: { processId, stepId }, dedupeKey: `finalize:${stepId}`,
    });
  }

  async markFinalized(
    tx: unknown | undefined,
    processId: string,
    entity: { kind: string; id: string },
    links: readonly LinkRecord[],
  ): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      await run.execute(sql`UPDATE ai_process_entities SET finalized_at=now(),links=links || ${JSON.stringify(links)}::jsonb
        WHERE process_id=${processId} AND entity_kind=${entity.kind} AND entity_id=${entity.id}`);
    });
  }

  async finish(processId: string, status: "completed" | "failed", response: ProcessResponse): Promise<void> {
    await this.database.pool.query(
      `UPDATE ai_processes SET status=$2,response=$3::jsonb,finished_at=now()
       WHERE id=$1 AND status IN ('dispatching','running')`, [processId, status, JSON.stringify(response)]);
  }

  async finishFallback(processId: string, stepId: string, text: string): Promise<void> {
    await this.inTransaction(undefined, async (run) => {
      await run.execute(sql`UPDATE ai_process_steps SET status='succeeded',finished_at=now() WHERE id=${stepId}`);
      await run.execute(sql`UPDATE ai_processes SET status='completed',finished_at=now(),
        response=${JSON.stringify({ failedSteps: [], text })}::jsonb
        WHERE id=${processId} AND status IN ('dispatching','running')`);
    });
  }
}
