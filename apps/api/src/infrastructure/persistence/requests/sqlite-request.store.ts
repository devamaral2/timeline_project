import type { TokenUsage } from "../../../api-core/agent/gateways/structured-completion.gateway";
import { createHash } from "node:crypto";
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
import type { EntryKind, EntryRole, Situation } from "../../../domain";
import { enqueueJobInTransaction } from "../../jobs/job-context";
import { taskArtifactRelation, taskEntries, tasks, taskTaskRelation, type TaskEntryRow } from "../database/tables";
import { c, type Db, jsonMerge, NOW, rowDecoder, sql, type SqlExecutor, type Tx } from "@repo/sqlite";
import { agentStatusesBefore, OPEN_AGENT_STATUSES } from "../../../domain/agent-status";
import type { AgentTaskStatus } from "../../../domain/sets";
import { sqlList } from "../database/schema/sets";
import { IN_PROGRESS, ON_CLOSE_SITUATION, OPEN_REQUEST, STOPPED_STATUS, STOPPED_STATUS_OF_STEP, before } from "./agent-status-sql";
import { insertAgentTask, newOrderedId } from "./request-rows";

type Row = Record<string, unknown>;

/** Quem executa SQL: a transacao do escritor em lote, uma transacao propria ou o banco solto. */
type Executor = Pick<SqlExecutor, "execute">;

type EntryRow = TaskEntryRow;

/** O pedido com o projeto e a sessao: as chaves sao os apelidos de `REQUEST_SELECT`. */
const requestRow = rowDecoder({
  id: tasks.columns.id,
  userId: tasks.columns.userId,
  kind: tasks.columns.kind,
  status: tasks.columns.status,
  situation: tasks.columns.situation,
  name: tasks.columns.name,
  data: tasks.columns.data,
  createdAt: tasks.columns.createdAt,
  updatedAt: tasks.columns.updatedAt,
  finishedAt: tasks.columns.finishedAt,
  sessionId: c.text.nullable(),
  projectId: c.text,
  projectName: c.text,
  projectPersonal: c.boolean,
});
type RequestRow = ReturnType<typeof requestRow.decode>;
type StepRow = ReturnType<typeof stepRow.decode>;

const stepRow = rowDecoder({
  id: tasks.columns.id,
  status: tasks.columns.status,
  name: tasks.columns.name,
  data: tasks.columns.data,
  startedAt: tasks.columns.startedAt,
  finishedAt: tasks.columns.finishedAt,
});

/** Uma entidade tocada, vinda das duas consultas de `entities` (a tarefa e o artefato tem as mesmas colunas). */
const touchedRow = rowDecoder({
  sourceId: c.text,
  step: c.boolean,
  kind: c.oneOf(["task", "artifact"] as const),
  id: c.text,
  relation: c.text,
  name: c.text,
  taskKind: c.text.nullable(),
  startedAt: c.timestamp.nullable(),
  estimatedFinishAt: c.timestamp.nullable(),
  series: c.boolean,
  artifactType: c.text.nullable(),
  preview: c.text.nullable(),
});

const finalizedRow = rowDecoder({
  data: c.json<{ entity: { kind: string; id: string }; links?: LinkRecord[] }>(),
});

const acceptedRow = rowDecoder({ response: c.json<{ requestId?: unknown }>().nullable() });
const ownerRow = rowDecoder({ userId: tasks.columns.userId });
const idRow = rowDecoder({ id: c.text });

/** A chave de idempotencia do reenvio da mesma mensagem (`idempotency_keys.scope`). */
export const REQUEST_IDEMPOTENCY_SCOPE = "request";

const TITLE_CHARS = 80;
const TEXT_PREVIEW_CHARS = 200;

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

const iso = (value: Date | null): string | undefined => value?.toISOString();

/**
 * O pedido e os passos como tarefas de agente (ADR 0013). O que se acrescenta a eles sao entradas, o que um
 * passo tocou sao relacoes partindo dele, e os jobs entram sempre na mesma transacao que o estado.
 */
export class SqliteRequestStore implements RequestStore {
  constructor(private readonly database: Db) {}

  /** A transacao do escritor em lote, ou uma nova. */
  private inTransaction<T>(tx: unknown | undefined, run: (tx: Tx) => Promise<T>): Promise<T> {
    if (tx) return run(tx as Tx);
    return this.database.transaction((own) => run(own));
  }

  async start(input: NewRequest): Promise<{ requestId: string; created: boolean }> {
    return this.inTransaction(undefined, async (tx) => {
      const requestId = newOrderedId();
      // A protecao contra reenviar a mesma mensagem nao pode depender de um job, que e apagado: mora aqui.
      if (input.clientMessageId) {
        const hash = createHash("sha256").update(`${input.route}\n${input.text}`).digest("hex");
        const claimed = await tx.execute(sql`
          INSERT INTO idempotency_keys (user_id, scope, key, request_hash, response)
          VALUES (${input.userId}, ${REQUEST_IDEMPOTENCY_SCOPE}, ${input.clientMessageId}, ${hash}, ${sql.json({ requestId })})
          ON CONFLICT DO NOTHING
          RETURNING key`);
        if (claimed.rows.length === 0) {
          const existing = await tx.get(sql`
            SELECT response FROM idempotency_keys
            WHERE user_id = ${input.userId} AND scope = ${REQUEST_IDEMPOTENCY_SCOPE} AND key = ${input.clientMessageId}`, acceptedRow);
          const accepted = existing?.response?.requestId;
          if (typeof accepted !== "string") throw new Error("Idempotency key without an accepted request");
          return { requestId: accepted, created: false };
        }
      }

      await insertAgentTask(tx, {
        id: requestId,
        userId: input.userId,
        kind: "request",
        // O pedido que passa pelo agente de roteamento (e a edicao por alvo) nasce `preparing`: ainda nao tem destino.
        status: input.route === "steps" ? "preparing" : "queued",
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
        await tx.execute(taskTaskRelation.insert({ fromTaskId: input.sessionId, toTaskId: requestId, relation: "follow_up" }));
      }
      await enqueueJobInTransaction(tx, {
        kind: input.job, userId: input.userId, actorId: input.userId, taskId: requestId,
        payload: { requestId }, dedupeKey: requestId,
      });
      return { requestId, created: true };
    });
  }

  async find(id: string): Promise<RequestRecord | undefined> {
    const rows = await this.database.all(sql`${REQUEST_SELECT} WHERE e.id = ${id} AND ${REQUEST_FILTER}`, requestRow);
    return (await this.hydrate(rows))[0];
  }

  async list(userId: string, limit: number): Promise<RequestRecord[]> {
    const rows = await this.database.all(
      sql`${REQUEST_SELECT} WHERE e.user_id = ${userId} AND ${REQUEST_FILTER} ORDER BY e.id DESC LIMIT ${limit}`, requestRow);
    return this.hydrate(rows);
  }

  async sessionTurns(userId: string, sessionId: string, limit: number): Promise<RequestRecord[]> {
    const rows = await this.database.all(sql`
      ${REQUEST_SELECT} WHERE e.user_id = ${userId} AND (e.id = ${sessionId} OR s.from_task_id = ${sessionId}) AND ${REQUEST_FILTER}
      ORDER BY e.id DESC LIMIT ${limit}`, requestRow);
    return (await this.hydrate(rows)).reverse();
  }

  private async hydrate(rows: readonly RequestRow[]): Promise<RequestRecord[]> {
    const entries = await this.entriesOf(rows.map((row) => row.id));
    return rows.map((row) => toRequestRecord(row, entries.get(row.id) ?? []));
  }

  async steps(requestId: string): Promise<StepRecord[]> {
    const rows = await this.database.all(sql`
      SELECT s.id AS id, s.status AS status, s.name AS name, s.data AS data, s.started_at AS "startedAt", s.finished_at AS "finishedAt"
      FROM task_task_relation r JOIN tasks s ON s.id = r.to_task_id
      WHERE r.from_task_id = ${requestId} AND r.relation = 'step' AND s.kind = 'step'
      ORDER BY s.id`, stepRow);
    const entries = await this.entriesOf(rows.map((row) => row.id));
    return rows.map((row) => toStepRecord(requestId, row, entries.get(row.id) ?? []));
  }

  async entities(requestId: string): Promise<RequestEntityRecord[]> {
    // As relacoes partem dos passos; na voz e no alimento, do proprio pedido. A tarefa que um passo tocou tambem
    // ganha a relacao do pedido: com o mesmo instante, o passo vem antes e vale (`step DESC`).
    const sources = sql`WITH sources AS (
      SELECT ${requestId} AS id, 0 AS step
      UNION ALL
      SELECT to_task_id, 1 FROM task_task_relation WHERE from_task_id = ${requestId} AND relation = 'step')`;
    const [touched, finalized] = await Promise.all([
      this.database.all(sql`
        ${sources}
        SELECT sources.id AS "sourceId", sources.step AS step, 'task' AS kind, e.id AS id, r.relation AS relation,
          e.name AS name, e.kind AS "taskKind", e.started_at AS "startedAt", e.estimated_finish_at AS "estimatedFinishAt",
          (e.recurrence_id IS NOT NULL AND NOT e.recurrence_detached) AS series,
          NULL AS "artifactType", NULL AS preview, r.created_at AS "createdAt"
        FROM sources
        JOIN task_task_relation r ON r.from_task_id = sources.id AND r.relation IN ('generates', 'updates', 'deletes')
        JOIN tasks e ON e.id = r.to_task_id
        UNION ALL
        SELECT sources.id, sources.step, 'artifact', a.id, r.relation, a.name, NULL, NULL, NULL, 0, a.type,
          substr(COALESCE(a.data->>'body', a.data->>'description', ''), 1, ${TEXT_PREVIEW_CHARS}), r.created_at
        FROM sources
        JOIN task_artifact_relation r ON r.task_id = sources.id
        JOIN artifacts a ON a.id = r.artifact_id
        ORDER BY "createdAt", step DESC, "sourceId", id`, touchedRow),
      this.database.all(sql`
        ${sources}
        SELECT n.data AS data FROM sources JOIN task_entries n ON n.task_id = sources.id
        WHERE n.kind = 'result' AND n.data->>'type' = 'finalized' ORDER BY n.id`, finalizedRow),
    ]);

    const key = (kind: string, id: string) => `${kind}:${id}`;
    const records = new Map<string, RequestEntityRecord>();
    for (const row of touched) {
      const { kind, id } = row;
      // A mesma entidade tocada por dois passos conta uma vez: vale o primeiro.
      if (records.has(key(kind, id))) continue;
      const summary: EntitySummary = kind === "task"
        ? {
          name: row.name, taskKind: String(row.taskKind),
          ...(row.startedAt ? { startedAt: iso(row.startedAt) } : {}),
          ...(row.estimatedFinishAt ? { estimatedFinishAt: iso(row.estimatedFinishAt) } : {}),
          ...(row.series ? { series: true } : {}),
        }
        : { name: row.name, artifactType: String(row.artifactType), ...(row.preview ? { text: row.preview } : {}) };
      records.set(key(kind, id), {
        requestId, kind, id, stepId: row.sourceId, operation: OPERATION[row.relation] ?? "update",
        // O que o proprio pedido tocou (voz, alimento) nao passa pela finalizacao.
        summary, finalized: !row.step, links: [],
      });
    }
    for (const { data } of finalized) {
      const record = records.get(key(data.entity.kind, data.entity.id));
      if (record) record.finalized = true;
      // A ligacao vale para os dois lados: as duas pontas a enxergam.
      for (const link of data.links ?? []) {
        for (const end of [link.from, link.to]) records.get(key(end.kind, end.id))?.links.push(link);
      }
    }
    return [...records.values()];
  }

  async markStarting(requestId: string): Promise<void> {
    await this.database.execute(sql`
      UPDATE tasks SET status = 'starting', updated_at = ${NOW}
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${before("starting")}`);
  }

  async markRunning(requestId: string): Promise<void> {
    await this.database.execute(sql`
      UPDATE tasks SET status = 'running', updated_at = ${NOW}
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${before("running")}`);
  }

  async beginSteps(requestId: string, steps: readonly NewStep[], dispatch?: DispatchRecord): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      // Qualquer pedido aberto se desdobra: o status so vira `running` (o que ja roda segue rodando).
      const userId = await this.lockRequest(tx, requestId, OPEN_AGENT_STATUSES);
      if (!userId) return;
      await this.insertSteps(tx, requestId, userId, steps);
      await this.recordDispatch(tx, requestId, { status: "running" }, dispatch, steps.length);
    });
  }

  async handToHermes(requestId: string, dispatch: DispatchRecord): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.lockRequest(tx, requestId, agentStatusesBefore("queued"));
      if (!userId) return;
      // `queued`: quem o passa a `starting` e a `running` e o job do Hermes, como num pedido que nasce na rota dele.
      await this.recordDispatch(tx, requestId, { status: "queued", route: "hermes" }, dispatch, 0);
      await enqueueJobInTransaction(tx, {
        kind: REQUEST_JOBS.hermes, userId, actorId: userId, taskId: requestId,
        payload: { requestId }, dedupeKey: `hermes:${requestId}`,
      });
    });
  }

  async handToModel(requestId: string, dispatch: DispatchRecord, model: ModelSelection): Promise<void> {
    await this.inTransaction(undefined, async (tx) => {
      const userId = await this.lockRequest(tx, requestId, agentStatusesBefore("queued"));
      if (!userId) return;
      // `queued`: quem o passa a `starting` e a `running` e o job do modelo, como num pedido que nasce na rota dele.
      await this.recordDispatch(tx, requestId, { status: "queued", route: "model", model }, dispatch, 0);
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
    patch: { status?: "queued" | "running"; route?: "hermes" | "model"; model?: ModelSelection },
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
      UPDATE tasks SET status = ${patch.status ?? sql`status`}, updated_at = ${NOW}, data = ${jsonMerge(sql.raw("data"), data)}
      WHERE id = ${requestId}`);
    if (dispatch) {
      await this.append(tx, requestId, {
        kind: "trace",
        data: { stage: "dispatch", ...(model ? { model } : {}), ...(latencyMs !== undefined ? { latencyMs } : {}), steps },
      });
    }
  }

  /**
   * O dono do pedido; nada se o pedido nao existe ou nao esta num dos status `from`. Sem trava de linha: a transacao
   * `IMMEDIATE` e o escritor unico ja seguram o pedido ate o commit.
   */
  private async lockRequest(tx: Tx, requestId: string, from: readonly AgentTaskStatus[]): Promise<string | undefined> {
    const found = await tx.get(sql`
      SELECT user_id AS "userId" FROM tasks
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN (${sqlList(from)})`, ownerRow);
    return found?.userId;
  }

  private async insertSteps(tx: Tx, requestId: string, userId: string, steps: readonly NewStep[]): Promise<void> {
    for (const step of steps) {
      const input = step.input ?? {};
      await insertAgentTask(tx, {
        id: step.id, userId, kind: "step", status: "queued", name: stepLabel(step.agent),
        data: { agent: step.agent, expected: step.expected },
        project: { requestId },
      });
      await tx.execute(taskTaskRelation.insert({ fromTaskId: requestId, toTaskId: step.id, relation: "step" }));
      // O insumo e onde o texto do usuario pode aparecer num passo: os candidatos, o retrato do alvo.
      if (Object.keys(input).length > 0) await this.append(tx, step.id, { kind: "input", data: { ...input } });
      await enqueueJobInTransaction(tx, {
        kind: REQUEST_JOBS.step, userId, actorId: userId, taskId: step.id,
        payload: { requestId, stepId: step.id }, dedupeKey: step.id,
      });
    }
  }

  async markStepRunning(stepId: string): Promise<void> {
    await this.database.execute(sql`
      UPDATE tasks SET status = 'running', updated_at = ${NOW},
        started_at = CASE WHEN status = 'queued' THEN ${NOW} ELSE started_at END
      WHERE id = ${stepId} AND kind = 'step' AND status IN ${IN_PROGRESS}`);
  }

  async recordThought(stepId: string, thought: StepThought): Promise<void> {
    await this.append(this.database, stepId, {
      kind: "thought", content: thought.text, data: { at: thought.at, ...(thought.model ? { model: thought.model } : {}) },
    });
  }

  async recordUsage(stepId: string, usage: TokenUsage): Promise<void> {
    await this.append(this.database, stepId, { kind: "trace", data: { stage: "usage", input: usage.input, output: usage.output } });
  }

  async recordStepSuccess(tx: unknown, input: {
    requestId: string;
    stepId: string;
    entities: readonly NewEntity[];
    timings: Record<string, number>;
  }): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      const userId = await this.closeStep(run, input.stepId, "completed", { timings: input.timings });
      // O passo foi cancelado enquanto o agente trabalhava: o erro desfaz as entidades do lote.
      if (!userId) throw new Error("Step is no longer open");
      for (const entity of input.entities) {
        if (entity.kind === "task") {
          // O passo e o pedido apontam para a tarefa: a tarefa mostra o pedido ("criado por", "atualizado
          // por") sem descer pelos passos, e cada pedido que o altera deixa a sua propria relacao.
          const relation = TASK_RELATION[entity.operation];
          await run.execute(sql`
            ${taskTaskRelation.insert([
              { fromTaskId: input.stepId, toTaskId: entity.id, relation },
              { fromTaskId: input.requestId, toTaskId: entity.id, relation },
            ])}
            ON CONFLICT (from_task_id, relation, to_task_id) DO NOTHING`);
        } else {
          await run.execute(sql`
            ${taskArtifactRelation.insert({ taskId: input.stepId, artifactId: entity.id, relation: ARTIFACT_RELATION[entity.operation] })}
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
      const userId = await this.closeStep(tx, input.stepId, "completed", { timings: input.timings });
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
    status: "completed" | "failed",
    detail: { timings?: Record<string, number>; errorCode?: string } = {},
  ): Promise<string | undefined> {
    const closed = await tx.execute(sql`
      UPDATE tasks SET status = ${status}, finished_at = ${NOW}, updated_at = ${NOW},
        data = ${jsonMerge(sql.raw("data"), detail.errorCode ? { errorCode: detail.errorCode } : {})}
      WHERE id = ${stepId} AND kind = 'step' AND status IN ${before(status)}
      RETURNING user_id AS "userId"`, ownerRow);
    const userId = closed.rows[0]?.userId;
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
    await this.append((tx as Executor | undefined) ?? this.database, entity.stepId, {
      kind: "result", data: { type: "finalized", entity: { kind: entity.kind, id: entity.id }, links },
    });
  }

  async finish(requestId: string, status: "completed" | "failed" | "interrupted", outcome: RequestOutcome): Promise<void> {
    await this.inTransaction(undefined, (tx) => this.closeRequest(tx, requestId, status, outcome));
  }

  async completeVoice(tx: unknown, input: { requestId: string; taskId: string }): Promise<void> {
    await this.inTransaction(tx, async (run) => {
      await run.execute(taskTaskRelation.insert({ fromTaskId: input.requestId, toTaskId: input.taskId, relation: "generates" }));
      await this.append(run, input.requestId, { kind: "result", data: { type: "voice", taskId: input.taskId } });
      // O pedido foi cancelado enquanto o modelo trabalhava: o erro desfaz a tarefa.
      if (!(await this.closeRequest(run, input.requestId, "completed", {}))) throw new Error("Request is no longer open");
    });
  }

  /** Encerra o pedido se ele ainda esta aberto. A resposta final e a ultima entrada. */
  private async closeRequest(tx: Tx, requestId: string, status: "completed" | "failed" | "interrupted", outcome: RequestOutcome): Promise<boolean> {
    const patch = {
      ...(outcome.failedSteps?.length ? { failedSteps: outcome.failedSteps } : {}),
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    };
    const closed = await tx.execute(sql`
      UPDATE tasks SET status = ${status}, situation = ${ON_CLOSE_SITUATION}, finished_at = ${NOW}, updated_at = ${NOW},
        data = ${jsonMerge(sql.raw("data"), patch)}
      WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${before(status)}
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
        UPDATE tasks SET status = ${STOPPED_STATUS}, situation = ${ON_CLOSE_SITUATION}, finished_at = ${NOW}, updated_at = ${NOW},
          data = ${jsonMerge(sql.raw("data"), { errorCode: "cancelled" satisfies RequestErrorCode })}
        WHERE id = ${requestId} AND actor = 'agent' AND kind <> 'step' AND status IN ${OPEN_REQUEST}
        RETURNING id`);
      if (cancelled.rows.length === 0) return [];
      await tx.execute(sql`
        UPDATE tasks AS s SET status = ${STOPPED_STATUS_OF_STEP}, finished_at = ${NOW}, updated_at = ${NOW}
        FROM task_task_relation r
        WHERE r.from_task_id = ${requestId} AND r.relation = 'step' AND r.to_task_id = s.id
          AND s.kind = 'step' AND s.status IN ${IN_PROGRESS}`);
      const steps = await tx.all(sql`
        SELECT to_task_id AS id FROM task_task_relation WHERE from_task_id = ${requestId} AND relation = 'step'`, idRow);
      return [requestId, ...steps.map((row) => row.id)];
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
        ${sql.json(entry.data ?? {})}
      FROM tasks e WHERE e.id = ${taskId}`);
  }

  private async entriesOf(taskIds: readonly string[]): Promise<Map<string, EntryRow[]>> {
    const byTask = new Map<string, EntryRow[]>();
    if (taskIds.length === 0) return byTask;
    const rows = await this.database.all(sql`
      SELECT ${taskEntries.select()} FROM task_entries WHERE task_id IN ${sql.in(taskIds)} ORDER BY id`, taskEntries);
    for (const row of rows) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row]);
    return byTask;
  }
}

// `tasks_requests_idx`: pedidos do usuario, nunca passos.
const REQUEST_FILTER = sql`e.actor = 'agent' AND e.kind <> 'step' AND e.deleted_at IS NULL`;
const REQUEST_SELECT = sql`
  SELECT e.id AS id, e.user_id AS "userId", e.kind AS kind, e.status AS status, e.situation AS situation, e.name AS name,
    e.data AS data, e.created_at AS "createdAt", e.updated_at AS "updatedAt", e.finished_at AS "finishedAt",
    s.from_task_id AS "sessionId", p.id AS "projectId", p.name AS "projectName", p.personal AS "projectPersonal"
  FROM tasks e
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN task_task_relation s ON s.to_task_id = e.id AND s.relation = 'follow_up'`;

function toRequestRecord(row: RequestRow, entries: readonly EntryRow[]): RequestRecord {
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
    id: row.id,
    userId: row.userId,
    kind: row.kind as AgentRequestKind,
    route: data.route ?? "steps",
    status: row.status as RequestRecord["status"],
    title: row.name,
    project: { id: row.projectId, name: row.projectName, personal: row.projectPersonal },
    ...(row.situation ? { situation: row.situation as Situation } : {}),
    prompt: messages.find((entry) => entry.role === "user")?.content ?? "",
    ...(data.context ? { context: data.context } : {}),
    ...(data.target ? { target: data.target } : {}),
    ...(data.forceFallback ? { forceFallback: true } : {}),
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(data.model ? { model: data.model } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}),
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

function toStepRecord(requestId: string, row: StepRow, entries: readonly EntryRow[]): StepRecord {
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
    id: row.id,
    requestId,
    agent: data.agent,
    label: row.name,
    expected: data.expected,
    status: row.status as StepRecord["status"],
    ...(data.errorCode ? { errorCode: data.errorCode } : {}),
    ...(Object.keys(input).length > 0 ? { input } : {}),
    ...(query ? { result: { columns: query.columns, rows: query.rows, truncated: query.truncated } } : {}),
    ...(row.startedAt ? { startedAt: row.startedAt } : {}),
    ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}),
    ...(timings ? { timings } : {}),
    ...(thoughts.length > 0 ? { thoughts } : {}),
    ...(usage ? { usage } : {}),
  };
}
