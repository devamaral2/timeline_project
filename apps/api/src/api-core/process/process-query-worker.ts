import type { ScopedSqlQuery } from "../../domain/ports";
import { queryOutput } from "./process-agent-schemas";
import { describeRequest, type ProcessAgentRunner } from "./process-agent-runner";
import { runStep, StepFailure, type StepPayload } from "./process-step-common";
import type { ProcessStore } from "./process-store";

const RESULT_ROWS = 50;
const SCOPE = { includeChat: false } as const;

/**
 * Executa o passo de consulta: o agente devolve UMA consulta de leitura, o servidor a executa com o executor
 * somente-leitura e escopo do usuario, e as linhas ficam no resultado do passo. Nao ha segunda chamada ao
 * modelo: a caixa de processo mostra as linhas.
 */
export class ProcessQueryWorker {
  constructor(
    private readonly deps: { store: ProcessStore; runner: ProcessAgentRunner; sql: ScopedSqlQuery },
  ) {}

  async run(payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store, runner, sql } = this.deps;
    await runStep(store, payload, signal, async ({ process, step, timings }) => {
      const started = performance.now();
      const { value } = await runner.run({
        agent: "query", now: process.createdAt, schema: queryOutput, signal,
        user: [describeRequest(process.prompt, undefined, process.context, step.input?.instruction), "", "Esquema:", sql.describeSchema(SCOPE)].join("\n"),
      });
      const outcome = await sql.run({ userId: process.userId, sql: value.sql, scope: SCOPE });
      if (!outcome.ok) throw new StepFailure("query_rejected");
      timings.total = Math.round(performance.now() - started);
      await store.recordQueryResult({
        processId: process.id, stepId: payload.stepId, timings,
        result: {
          columns: outcome.columns, rows: outcome.rows.slice(0, RESULT_ROWS),
          truncated: outcome.truncated || outcome.rows.length > RESULT_ROWS,
        },
      });
    });
  }
}
