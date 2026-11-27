import type { TokenUsage } from "../../../api-core/agent/gateways/structured-completion.gateway";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type {
  AgentRequestKind,
  AgentTraceDto,
  AgentTraceEntryDto,
  ModelSelection,
  RequestErrorCode,
  RequestQueryResult,
  RequestRoute,
  RequestScreenContext,
} from "@repo/contracts";
import { stepLabel } from "../../../api-core/requests/request-config";
import { IN_PROGRESS_AGENT_STATUSES, OPEN_AGENT_STATUSES } from "../../../domain/agent-status";
import { sqlList } from "../database/schema/sets";
import { finalizeConcurrencyKey, REQUEST_JOBS, type RequestAgent } from "../../../api-core/requests/request-steps";
import type {
  DispatchRecord,
  EntitySummary,
  FailedStep,
  LinkRecord,
  NewEntity,
  NewRequest,
  NewStep,
  RequestEntityRecord,
  RequestOutcome,
  RequestRecord,
  RequestStore,
  RequestTarget,
  StepInput,
  StepRecord,
  StepThought,
} from "../../../api-core/requests/request-store";
import type { EntryKind, EntryRole } from "../../../domain";
import { enqueueJobInTransaction } from "../../jobs/job-context";
import type { PostgresDatabase } from "../database/postgres-database";
import type { Tx } from "../shared/tx";
import { insertAgentTask, newOrderedId } from "./request-rows";

type Row = Record<string, unknown>;

/** Quem executa SQL: a transacao do escritor em lote, uma transacao propria ou a conexao solta. */
interface Executor {
  execute(query: SQL): Promise<{ rows: Row[] }>;
}

interface EntryRow {
  id: string;
  taskId: string;
  kind: EntryKind;
  role: EntryRole | null;
  content: string | null;
  data: Row;
}

/** A chave de idempotencia do reenvio da mesma mensagem (`idempotency_keys.scope`). */
export const REQUEST_IDEMPOTENCY_SCOPE = "request";

const TITLE_CHARS = 80;
const TEXT_PREVIEW_CHARS = 200;
const OPEN_REQUEST = sql`(${sqlList(OPEN_AGENT_STATUSES)})`;
const IN_PROGRESS = sql`(${sqlList(IN_PROGRESS_AGENT_STATUSES)})`;

const TASK_RELATION = { create: "generates", update: "updates", delete: "deletes" } as const;
const ARTIFACT_RELATION = { create: "creates", update: "updates", delete: "deletes" } as const;
const OPERATION: Record<string, RequestEntityRecord["operation"]> = {
  generates: "create", creates: "create", updates: "update", deletes: "delete",
};

/** O nome do pedido: o inicio do que o usuario pediu, numa linha. E o que a agenda e a lista de tarefas mostram. */
export function requestTitleOf(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length <= TITLE_CHARS ? line : `${line.slice(0, TITLE_CHARS - 1)}…`;
}

const date = (value: unknown): Date | undefined =>
  value === null || value === undefined ? undefined : new Date(value as string | Date);
const iso = (value: unknown): string | undefined => date(value)?.toISOString();
const json = (value: unknown) => JSON.stringify(value);

/**
 * O pedido e os passos como tarefas de agente (ADR 0013). O que se acrescenta a eles sao entradas, o que um
 * passo tocou sao relacoes partindo dele, e os jobs entram sempre na mesma transacao que o estado.
 */
export class PostgresRequestStore implements RequestStore {
  constructor(private readonly database: PostgresDatabase) {}

  private get db(): Executor {
    return this.database.db as unknown as Executor;
  }

  /** A transacao do escritor em lote, ou uma nova. */
  private inTransaction<T>(tx: unknown | undefined, run: (tx: Tx) => Promise<T>): Promise<T> {
    if (tx) return run(tx as Tx);
    return this.database.db.transaction((own) => run(own));
  }

  async start(input: NewRequest): Promise<{ requestId: string; created: boolean }> {
    return this.inTransaction(undefined, async (tx) => {
      const requestId = newOrderedId();
      // A protecao contra reenviar a mesma mensagem nao pode depender de um job, que e apagado: mora aqui.
      if (input.clientMessageId) {
        const hash = createHash("sha256").update(`${input.route}\n${input.text}`).digest("hex");
        const claimed = await tx.execute(sql`
          INSERT INTO idempotency_keys (user_id, scope, key, request_hash, response)
          VALUES (${input.userId}, ${REQUEST_IDEMPOTENCY_SCOPE}, ${input.clientMessageId}, ${hash}, ${json({ requestId })}::jsonb)
          ON CONFLICT DO NOTHING
          RETURNING key`);
        if (claimed.rows.length === 0) {
          const existing = await tx.execute<{ response: { requestId?: unknown } | null }>(sql`
            SELECT response FROM idempotency_keys
            WHERE user_id = ${input.userId} AND scope = ${REQUEST_IDEMPOTENCY_SCOPE} AND key = ${input.clientMessageId}`);
          const accepted = existing.rows[0]?.response?.requestId;
          if (typeof accepted !== "string") throw new Error("Idempotency key without an accepted request");
          return { requestId: accepted, created: false };
        }
      }

      await insertAgentTask(tx, {
        id: requestId,
        userId: input.userId,
        kind: "request",
        status: "queued",
        name: requestTitleOf(input.text),
        data: {
          route: input.route,
          ...(input.context ? { context: input.context } : {}),
          ...(input.target ? { target: input.target } : {}),
          ...(input.forceFallback ? { forceFallback: true } : {}),
          ...(input.model ? { model: input.model } : {}),
          ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        },
        project: {
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          // So a tarefa tem projeto: o alvo que e artefato nao decide nada.
          ...(input.target?.entityType === "task" ? { targetTaskId: input.target.entityId } : {}),
        },
      });
      await this.append(tx, requestId, { kind: "message", role: "user", content: input.text });
      if (input.sessionId) {
        await tx.execute(sql`
          INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
          VALUES (${input.sessionId}, ${requestId}, 'follow_up')`);
      }
      await enqueueJobInTransaction(tx, {
        kind: input.job, userId: input.userId, actorId: input.userId, taskId: requestId,
        payload: { requestId }, dedupeKey: requestId,
      });
      return { requestId, created: true };
    });
  }

  async find(id: string): Promise<RequestRecord | undefined> {
    const { rows } = await this.database.pool.query<Row>(`${REQUEST_SELECT} WHERE e.id = $1 AND ${REQUEST_FILTER}`, [id]);
    return (await this.hydrate(rows))[0];
  }

  async list(userId: string, limit: number): Promise<RequestRecord[]> {
    const { rows } = await this.database.pool.query<Row>(
      `${REQUEST_SELECT} WHERE e.user_id = $1 AND ${REQUEST_FILTER} ORDER BY e.id DESC LIMIT $2`, [userId, limit]);
    return this.hydrate(rows);
  }

  async sessionTurns(userId: string, sessionId: string, limit: number): Promise<RequestRecord[]> {
    const { rows } = await this.database.pool.query<Row>(
      `${REQUEST_SELECT} WHERE e.user_id = $1 AND (e.id = $2 OR s.from_task_id = $2) AND ${REQUEST_FILTER}
       ORDER BY e.id DESC LIMIT $3`, [userId, sessionId, limit]);
    return (await this.hydrate(rows)).reverse();
  }

  private async hydrate(rows: readonly Row[]): Promise<RequestRecord[]> {
    const entries = await this.entriesOf(rows.map((row) => String(row.id)));
    return rows.map((row) => toRequestRecord(row, entries.get(String(row.id)) ?? []));
  }

  async steps(requestId: string): Promise<StepRecord[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT s.id, s.status, s.name, s.data, s.started_at, s.finished_at
       FROM task_task_relation r JOIN tasks s ON s.id = r.to_task_id
       WHERE r.from_task_id = $1 AND r.relation = 'step' AND s.kind = 'step'
       ORDER BY s.id`, [requestId]);
    const entries = await this.entriesOf(rows.map((row) => String(row.id)));
    return rows.map((row) => toStepRecord(requestId, row, entries.get(String(row.id)) ?? []));
  }

  async entities(requestId: string): Promise<RequestEntityRecord[]> {
    // As relacoes partem dos passos; na voz e no alimento, do proprio pedido. A tarefa que um passo tocou tambem
    // ganha a relacao do pedido: com o mesmo instante, o passo vem antes e vale (`step DESC`).
    const sources = `WITH sources AS (
      SELECT $1::char(26) AS id, false AS step
      UNION ALL
      SELECT to_task_id, true FROM task_task_relation WHERE from_task_id = $1 AND relation = 'step')`;
    const [touched, finalized] = await Promise.all([
      this.database.pool.query<Row>(
        `${sources}
         SELECT sources.id AS source_id, sources.step, 'task' AS kind, e.id, r.relation, e.name, e.kind AS task_kind,
           e.started_at, e.estimated_finish_at, (e.recurrence_id IS NOT NULL AND NOT e.recurrence_detached) AS series,
           NULL AS artifact_type, NULL AS preview, r.created_at
         FROM sources
         JOIN task_task_relation r ON r.from_task_id = sources.id AND r.relation IN ('generates', 'updates', 'deletes')
         JOIN tasks e ON e.id = r.to_task_id
         UNION ALL
         SELECT sources.id, sources.step, 'artifact', a.id, r.relation, a.name, NULL, NULL, NULL, false, a.type,
           left(COALESCE(a.data->>'body', a.data->>'description', ''), ${TEXT_PREVIEW_CHARS}), r.created_at
         FROM sources
         JOIN task_artifact_relation r ON r.task_id = sources.id
         JOIN artifacts a ON a.id = r.artifact_id
         ORDER BY created_at, step DESC, source_id, id`, [requestId]),
      this.database.pool.query<{ data: { entity: { kind: string; id: string }; links: LinkRecord[] } }>(
        `${sources}
         SELECT n.data FROM sources JOIN task_entries n ON n.task_id = sources.id
         WHERE n.kind = 'result' AND n.data->>'type' = 'finalized' ORDER BY n.id`, [requestId]),
    ]);

    const key = (kind: string, id: string) => `${kind}:${id}`;
    const records = new Map<string, RequestEntityRecord>();
    for (const row of touched.rows) {
      const kind = row.kind as RequestEntityRecord["kind"];
      const id = String(row.id);
      // A mesma entidade tocada por dois passos conta uma vez: vale o primeiro.
      if (records.has(key(kind, id))) continue;
      const summary: EntitySummary = kind === "task"
        ? {
          name: String(row.name), taskKind: String(row.task_kind),
          ...(row.started_at ? { startedAt: iso(row.started_at) } : {}),
          ...(row.estimated_finish_at ? { estimatedFinishAt: iso(row.estimated_finish_at) } : {}),
          ...(row.series ? { series: true } : {}),
        }
        : { name: String(row.name), artifactType: String(row.artifact_type), ...(row.preview ? { text: String(row.preview) } : {}) };
      records.set(key(kind, id), {
        requestId, kind, id, stepId: String(row.source_id), operation: OPERATION[String(row.relation)] ?? "update",
        // O que o proprio pedido tocou (voz, alimento) nao passa pela finalizacao.
        summary, finalized: !row.step, links: [],
      });
    }
    for (const { data } of finalized.rows) {
      const record = records.get(key(data.entity.kind, data.entity.id));
      if (record) record.finalized = true;
      // A ligacao vale para os dois lados: as duas pontas a enxergam.
      for (const link of data.links ?? []) {
        for (const end of [link.from, link.to]) records.get(key(end.kind, end.id))?.links.push(link);
      }
    }
    return [...records.values()];
  }

  async markRunning(requestId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE tasks SET status = 'running', updated_at = now()
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status = 'queued'`);
  }

  async beginSteps(requestId: string, steps: readonly NewStep[], dispatch?: DispatchRecord): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.lockOpenRequest(tx, requestId);
      if (!userId) return;
      await this.insertSteps(tx, requestId, userId, steps);
      await this.recordDispatch(tx, requestId, { status: "running" }, dispatch, steps.length);
    });
  }

  async handToHermes(requestId: string, dispatch: DispatchRecord): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.lockOpenRequest(tx, requestId);
      if (!userId) return;
      // Continua `queued`: quem o passa a `running` e o job do Hermes, como num pedido que nasce na rota dele.
      await this.recordDispatch(tx, requestId, { route: "hermes" }, dispatch, 0);
      await enqueueJobInTransaction(tx, {
        kind: REQUEST_JOBS.hermes, userId, actorId: userId, taskId: requestId,
        payload: { requestId }, dedupeKey: `hermes:${requestId}`,
      });
    });
  }

  async handToModel(requestId: string, dispatch: DispatchRecord, model: ModelSelection): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.lockOpenRequest(tx, requestId);
      if (!userId) return;
      // Continua `queued`: quem o passa a `running` e o job do modelo, como num pedido que nasce na rota dele.
      await this.recordDispatch(tx, requestId, { route: "model", model }, dispatch, 0);
      await enqueueJobInTransaction(tx, {
        kind: REQUEST_JOBS.model, userId, actorId: userId, taskId: requestId,
        payload: { requestId }, dedupeKey: `model:${requestId}`,
      });
    });
  }

  /** As escolhas do despacho ficam no pedido (com `patch`); as medidas (modelo, latencia), numa entrada de trace. */
  private async recordDispatch(
    tx: Tx,
    requestId: string,
    patch: { status?: "running"; route?: "hermes" | "model"; model?: ModelSelection },
    dispatch: DispatchRecord | undefined,
    steps: number,
  ): Promise<void> {
    const { model, latencyMs, ...choices } = dispatch ?? {};
    const data = {
      ...(patch.route ? { route: patch.route } : {}),
      ...(patch.model ? { model: patch.model } : {}),
      ...(dispatch ? { dispatch: choices } : {}),
    };
    await tx.execute(sql`
      UPDATE tasks SET status = ${patch.status ?? sql`status`}, updated_at = now(), data = data || ${json(data)}::jsonb
      WHERE id = ${requestId}`);
    if (dispatch) {
      await this.append(tx, requestId, {
        kind: "trace",
        data: { stage: "dispatch", ...(model ? { model } : {}), ...(latencyMs !== undefined ? { latencyMs } : {}), steps },
      });
    }
  }

  /** O dono do pedido, com a linha travada; nada se o pedido nao existe ou ja terminou. */
  private async lockOpenRequest(tx: Tx, requestId: string): Promise<string | undefined> {
    const found = await tx.execute<{ user_id: string }>(sql`
      SELECT user_id FROM tasks
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${OPEN_REQUEST}
      FOR UPDATE`);
    return found.rows[0]?.user_id;
  }

  private async insertSteps(tx: Tx, requestId: string, userId: string, steps: readonly NewStep[]): Promise<void> {
    for (const step of steps) {
      const input = step.input ?? {};
      await insertAgentTask(tx, {
        id: step.id, userId, kind: "step", status: "queued", name: stepLabel(step.agent),
        data: { agent: step.agent, expected: step.expected },
        project: { requestId },
      });
      await tx.execute(sql`
        INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
        VALUES (${requestId}, ${step.id}, 'step')`);
      // O insumo e onde o texto do usuario pode aparecer num passo: os candidatos, o retrato do alvo.
      if (Object.keys(input).length > 0) await this.append(tx, step.id, { kind: "input", data: { ...input } });
      await enqueueJobInTransaction(tx, {
        kind: REQUEST_JOBS.step, userId, actorId: userId, taskId: step.id,
        payload: { requestId, stepId: step.id }, dedupeKey: step.id,
      });
    }
  }

  async markStepRunning(stepId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE tasks SET status = 'running', updated_at = now(),
        started_at = CASE WHEN status = 'queued' THEN now() ELSE started_at END
      WHERE id = ${stepId} AND kind = 'step' AND status IN ${IN_PROGRESS}`);
  }

  async recordThought(stepId: string, thought: StepThought): Promise<void> {
    await this.append(this.db, stepId, {
      kind: "thought", content: thought.text, data: { at: thought.at, ...(thought.model ? { model: thought.model } : {}) },
    });
  }

  async recordUsage(stepId: string, usage: TokenUsage): Promise<void> {
    await this.append(this.db, stepId, { kind: "trace", data: { stage: "usage", input: usage.input, output: usage.output } });
  }

  async recordStepSuccess(tx: unknown, input: {
    requestId: string;
    stepId: string;
    entities: readonly NewEntity[];
    timings: Record<string, number>;
  }): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      const userId = await this.closeStep(run, input.stepId, "done", { timings: input.timings });
      // O passo foi cancelado enquanto o agente trabalhava: o erro desfaz as entidades do lote.
      if (!userId) throw new Error("Step is no longer open");
      for (const entity of input.entities) {
        if (entity.kind === "task") {
          // O passo e o pedido apontam para a tarefa: a tarefa mostra o pedido ("criado por", "atualizado
          // por") sem descer pelos passos, e cada pedido que o altera deixa a sua propria relacao.
          await run.execute(sql`
            INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
            VALUES (${input.stepId}, ${entity.id}, ${TASK_RELATION[entity.operation]}),
                   (${input.requestId}, ${entity.id}, ${TASK_RELATION[entity.operation]})
            ON CONFLICT (from_task_id, relation, to_task_id) DO NOTHING`);
        } else {
          await run.execute(sql`
            INSERT INTO task_artifact_relation (task_id, artifact_id, relation)
            VALUES (${input.stepId}, ${entity.id}, ${ARTIFACT_RELATION[entity.operation]})
            ON CONFLICT (task_id, artifact_id) DO NOTHING`);
        }
      }
      await this.enqueueFinalize(run, input.requestId, input.stepId, userId);
    });
  }

  async recordQueryResult(input: {
    requestId: string;
    stepId: string;
    result: RequestQueryResult;
    timings: Record<string, number>;
  }): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.closeStep(tx, input.stepId, "done", { timings: input.timings });
      if (!userId) return;
      await this.append(tx, input.stepId, { kind: "result", data: { type: "query", ...input.result } });
      await this.enqueueFinalize(tx, input.requestId, input.stepId, userId);
    });
  }

  async failStep(input: { requestId: string; stepId: string; errorCode: string; timings?: Record<string, number> }): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.closeStep(tx, input.stepId, "failed", { timings: input.timings, errorCode: input.errorCode });
      if (!userId) return;
      await this.enqueueFinalize(tx, input.requestId, input.stepId, userId);
    });
  }

  /** Encerra o passo se ele ainda esta aberto e devolve o dono; os tempos e o codigo de erro vao num trace. */
  private async closeStep(
    tx: Tx,
    stepId: string,
    status: "done" | "failed",
    detail: { timings?: Record<string, number>; errorCode?: string } = {},
  ): Promise<string | undefined> {
    const closed = await tx.execute<{ user_id: string }>(sql`
      UPDATE tasks SET status = ${status}, finished_at = now(), updated_at = now(),
        data = data || ${json(detail.errorCode ? { errorCode: detail.errorCode } : {})}::jsonb
      WHERE id = ${stepId} AND kind = 'step' AND status IN ${IN_PROGRESS}
      RETURNING user_id`);
    const userId = closed.rows[0]?.user_id;
    if (userId && (detail.timings || detail.errorCode)) {
      await this.append(tx, stepId, {
        kind: "trace",
        data: { ...(detail.timings ? { timings: detail.timings } : {}), ...(detail.errorCode ? { errorCode: detail.errorCode } : {}) },
      });
    }
    return userId;
  }

  private async enqueueFinalize(tx: Tx, requestId: string, stepId: string, userId: string): Promise<void> {
    await enqueueJobInTransaction(tx, {
      kind: REQUEST_JOBS.finalize, userId, actorId: userId, taskId: stepId,
      payload: { requestId, stepId }, dedupeKey: `finalize:${stepId}`,
      concurrencyKey: finalizeConcurrencyKey(requestId),
    });
  }

  async markFinalized(
    tx: unknown | undefined,
    entity: Pick<RequestEntityRecord, "kind" | "id" | "stepId">,
    links: readonly LinkRecord[],
  ): Promise<void> {
    await this.append((tx as Executor | undefined) ?? this.db, entity.stepId, {
      kind: "result", data: { type: "finalized", entity: { kind: entity.kind, id: entity.id }, links },
    });
  }

  async finish(requestId: string, status: "done" | "failed", outcome: RequestOutcome): Promise<void> {
    await this.inTransaction(undefined, (tx) => this.closeRequest(tx, requestId, status, outcome));
  }

  async completeVoice(tx: unknown, input: { requestId: string; taskId: string }): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      await run.execute(sql`
        INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
        VALUES (${input.requestId}, ${input.taskId}, 'generates')`);
      await this.append(run, input.requestId, { kind: "result", data: { type: "voice", taskId: input.taskId } });
      // O pedido foi cancelado enquanto o modelo trabalhava: o erro desfaz a tarefa.
      if (!(await this.closeRequest(run, input.requestId, "done", {}))) throw new Error("Request is no longer open");
    });
  }

  /** Encerra o pedido se ele ainda esta aberto. A resposta final e a ultima entrada. */
  private async closeRequest(tx: Tx, requestId: string, status: "done" | "failed", outcome: RequestOutcome): Promise<boolean> {
    const patch = {
      ...(outcome.failedSteps?.length ? { failedSteps: outcome.failedSteps } : {}),
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    };
    const closed = await tx.execute(sql`
      UPDATE tasks SET status = ${status}, finished_at = now(), updated_at = now(), data = data || ${json(patch)}::jsonb
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${OPEN_REQUEST}
      RETURNING id`);
    if (closed.rows.length === 0) return false;

    if (outcome.trace) {
      // O rastro do Hermes carrega texto (o que ele pensou, o que mandou as ferramentas): cada item e um
      // pensamento. O trace guarda so os numeros e codigos do pedido inteiro.
      const { entries, ...header } = outcome.trace;
      for (const entry of entries) {
        await this.append(tx, requestId, { kind: "thought", content: entry.summary ?? entry.label, data: { trace: entry } });
      }
      await this.append(tx, requestId, { kind: "trace", data: { stage: "turn", ...header } });
    }
    if (outcome.thought) await this.append(tx, requestId, { kind: "thought", content: outcome.thought });
    if (outcome.message) await this.append(tx, requestId, { kind: "message", role: "agent", content: outcome.message });
    return true;
  }

  async cancel(requestId: string): Promise<string[]> {
    return this.inTransaction(undefined, async (tx) => {
      const cancelled = await tx.execute(sql`
        UPDATE tasks SET status = 'cancel', finished_at = now(), updated_at = now(),
          data = data || ${json({ errorCode: "cancelled" satisfies RequestErrorCode })}::jsonb
        WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${OPEN_REQUEST}
        RETURNING id`);
      if (cancelled.rows.length === 0) return [];
      await tx.execute(sql`
        UPDATE tasks s SET status = 'cancel', finished_at = now(), updated_at = now()
        FROM task_task_relation r
        WHERE r.from_task_id = ${requestId} AND r.relation = 'step' AND r.to_task_id = s.id
          AND s.kind = 'step' AND s.status IN ${IN_PROGRESS}`);
      const steps = await tx.execute<{ id: string }>(sql`
        SELECT to_task_id AS id FROM task_task_relation WHERE from_task_id = ${requestId} AND relation = 'step'`);
      return [requestId, ...steps.rows.map((row) => row.id)];
    });
  }

  /** Acrescenta uma entrada à tarefa, com o dono dela. Entradas nunca mudam e nao contam como revisao. */
  private async append(
    executor: Executor,
    taskId: string,
    entry: { kind: EntryKind; role?: EntryRole; content?: string; data?: Row },
  ): Promise<void> {
    await executor.execute(sql`
      INSERT INTO task_entries (id, task_id, user_id, kind, role, content, data)
      SELECT ${newOrderedId()}, e.id, e.user_id, ${entry.kind}, ${entry.role ?? null}, ${entry.content ?? null},
        ${json(entry.data ?? {})}::jsonb
      FROM tasks e WHERE e.id = ${taskId}`);
  }

  private async entriesOf(taskIds: readonly string[]): Promise<Map<string, EntryRow[]>> {
    const byTask = new Map<string, EntryRow[]>();
    if (taskIds.length === 0) return byTask;
    const { rows } = await this.database.pool.query<EntryRow>(
      `SELECT id, task_id AS "taskId", kind, role, content, data FROM task_entries
       WHERE task_id = ANY($1::char(26)[]) ORDER BY id`, [taskIds]);
    for (const row of rows) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row]);
    return byTask;
  }
}

// `tasks_requests_idx`: pedidos do usuario, nunca passos.
const REQUEST_FILTER = "e.actor = 'agent' AND e.kind <> 'step' AND e.deleted_at IS NULL";
const REQUEST_SELECT = `
  SELECT e.id, e.user_id, e.kind, e.status, e.name, e.data, e.created_at, e.updated_at, e.finished_at,
    s.from_task_id AS session_id, p.id AS project_id, p.name AS project_name, p.personal AS project_personal
  FROM tasks e
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN task_task_relation s ON s.to_task_id = e.id AND s.relation = 'follow_up'`;

function toRequestRecord(row: Row, entries: readonly EntryRow[]): RequestRecord {
  const data = (row.data ?? {}) as {
    route?: RequestRoute; context?: RequestScreenContext; target?: RequestTarget; forceFallback?: boolean; model?: ModelSelection;
    dispatch?: DispatchRecord; failedSteps?: FailedStep[]; errorCode?: RequestErrorCode;
  };
  const messages = entries.filter((entry) => entry.kind === "message");
  const thoughts = entries.filter((entry) => entry.kind === "thought");
  const traces = entries.filter((entry) => entry.kind === "trace");
  const measured = traces.find((entry) => entry.data.stage === "dispatch")?.data as { model?: string; latencyMs?: number } | undefined;
  const turn = traces.filter((entry) => entry.data.stage === "turn").at(-1)?.data as (Omit<AgentTraceDto, "entries"> & { stage?: string }) | undefined;
  const answer = messages.filter((entry) => entry.role === "agent").at(-1)?.content ?? undefined;
  const answerThought = thoughts.filter((entry) => entry.data.trace === undefined).at(-1)?.content ?? undefined;

  let trace: AgentTraceDto | undefined;
  if (turn) {
    const { stage: _stage, ...header } = turn;
    trace = {
      ...header,
      entries: thoughts.flatMap((entry) => (entry.data.trace ? [entry.data.trace as AgentTraceEntryDto] : [])),
    };
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: row.kind as AgentRequestKind,
    route: data.route ?? "steps",
    status: row.status as RequestRecord["status"],
    title: String(row.name),
    project: { id: String(row.project_id), name: String(row.project_name), personal: Boolean(row.project_personal) },
    prompt: messages.find((entry) => entry.role === "user")?.content ?? "",
    ...(data.context ? { context: data.context } : {}),
    ...(data.target ? { target: data.target } : {}),
    ...(data.forceFallback ? { forceFallback: true } : {}),
    ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
    ...(data.model ? { model: data.model } : {}),
    createdAt: new Date(row.created_at as string | Date),
    updatedAt: new Date(row.updated_at as string | Date),
    ...(row.finished_at ? { finishedAt: date(row.finished_at) } : {}),
    ...(data.dispatch
      ? { dispatch: { ...data.dispatch, ...(measured?.model ? { model: measured.model } : {}), ...(measured?.latencyMs !== undefined ? { latencyMs: measured.latencyMs } : {}) } }
      : {}),
    failedSteps: data.failedSteps ?? [],
    ...(data.errorCode ? { errorCode: data.errorCode } : {}),
    ...(answer ? { answer } : {}),
    ...(answerThought ? { answerThought } : {}),
    ...(trace ? { trace } : {}),
  };
}

function toStepRecord(requestId: string, row: Row, entries: readonly EntryRow[]): StepRecord {
  const data = (row.data ?? {}) as { agent: RequestAgent; expected: StepRecord["expected"]; errorCode?: string };
  const given = entries.find((entry) => entry.kind === "input");
  const input: StepInput = (given?.data ?? {}) as StepInput;
  const thoughts = entries.filter((entry) => entry.kind === "thought").map((entry): StepThought => ({
    text: entry.content ?? "", at: String(entry.data.at ?? ""), ...(entry.data.model ? { model: String(entry.data.model) } : {}),
  }));
  const usages = entries.filter((entry) => entry.kind === "trace" && entry.data.stage === "usage");
  const usage: TokenUsage | undefined = usages.length > 0
    ? { input: usages.reduce((sum, entry) => sum + Number(entry.data.input ?? 0), 0), output: usages.reduce((sum, entry) => sum + Number(entry.data.output ?? 0), 0) }
    : undefined;
  const timings = entries.filter((entry) => entry.kind === "trace" && entry.data.timings).at(-1)?.data.timings as Record<string, number> | undefined;
  const query = entries.find((entry) => entry.kind === "result" && entry.data.type === "query")?.data as
    | (RequestQueryResult & { type?: string })
    | undefined;
  return {
    id: String(row.id),
    requestId,
    agent: data.agent,
    label: String(row.name),
    expected: data.expected,
    status: row.status as StepRecord["status"],
    ...(data.errorCode ? { errorCode: data.errorCode } : {}),
    ...(Object.keys(input).length > 0 ? { input } : {}),
    ...(query ? { result: { columns: query.columns, rows: query.rows, truncated: query.truncated } } : {}),
    ...(row.started_at ? { startedAt: date(row.started_at) } : {}),
    ...(row.finished_at ? { finishedAt: date(row.finished_at) } : {}),
    ...(timings ? { timings } : {}),
    ...(thoughts.length > 0 ? { thoughts } : {}),
    ...(usage ? { usage } : {}),
  };
}
