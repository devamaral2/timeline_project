import type { ScopedSqlQuery } from "../../domain/ports";
import { queryOutput } from "./request-agent-schemas";
import { describeRequest, type RequestAgentRunner } from "./request-agent-runner";
import { runStep, StepFailure, type StepPayload } from "./request-step-common";
import type { RequestStore } from "./request-store";

const RESULT_ROWS = 50;

/**
 * Executa o passo de consulta: o agente devolve UMA consulta de leitura, o servidor a executa com o executor
 * somente-leitura e escopo do usuario, e as linhas ficam no resultado do passo. Nao ha segunda chamada ao
 * modelo: a caixa do pedido mostra as linhas.
 */
export class RequestQueryWorker {
  constructor(
    private readonly deps: { store: RequestStore; runner: RequestAgentRunner; sql: ScopedSqlQuery },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner, sql } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const started = performance.now();
      const { value } = await runner.run({
        agent: "query", now: request.createdAt, schema: queryOutput, signal, stepId: step.id, model: request.model,
        user: [describeRequest(request.prompt, undefined, request.context), "", "Esquema:", sql.describeSchema()].join("\n"),
      });
      const outcome = await sql.run({ userId: request.userId, sql: value.sql });
      if (!outcome.ok) throw new StepFailure("query_rejected");
      timings.total = Math.round(performance.now() - started);
      await store.recordQueryResult({
        requestId: request.id, stepId: payload.stepId, timings,
        result: {
          columns: outcome.columns, rows: outcome.rows.slice(0, RESULT_ROWS),
          truncated: outcome.truncated || outcome.rows.length > RESULT_ROWS,
        },
      });
    });
  }
}
