import type { RouteDecision } from "../routing/agent-router";
import { TurnTimings } from "./turn-timings";

export type TurnOutcome =
  | "ok"
  | "clarification"
  | "cancelled"
  | "limit_reached"
  | "invalid_input"
  | "unavailable"
  | "conflict"
  | "error";

export interface ToolCallTrace {
  name: string;
  ms: number;
  ok: boolean;
}

/**
 * Uma tentativa de turno, como o banco a guarda. So numeros, nomes e codigos:
 * nada do texto do usuario nem do modelo entra aqui.
 */
export interface TurnTraceRecord {
  jobId: string | null;
  userId: string;
  actorId: string;
  /** Tentativa do job (1 = primeira). Null fora de um job. */
  attempt: number | null;
  /** Do envio do job ate o inicio desta tentativa. Inclui fila e tentativas anteriores. */
  sinceSubmittedMs: number | null;
  mode: "chat" | "rest";
  route: string;
  rerouted: boolean;
  routeDecision: RouteDecision | null;
  model: string | null;
  outcome: TurnOutcome;
  errorCode: string | null;
  stoppedByLimit: boolean;
  changes: number;
  totalMs: number;
  stages: Record<string, number>;
  tools: ToolCallTrace[];
}

export interface TurnTraceSink {
  record(trace: TurnTraceRecord): Promise<void>;
}

const ERROR_OUTCOMES: Record<string, TurnOutcome> = {
  AgentRunCancelledError: "cancelled",
  AgentLimitReachedError: "limit_reached",
  InvalidInputError: "invalid_input",
  LlmUnavailableError: "unavailable",
  EntityBatchConflictError: "conflict",
};

/** Cronometra as etapas de um turno e junta o que explica a lentidao ou a falha. */
export class TurnTrace extends TurnTimings {
  private routeName = "unrouted";
  private reroutedFlag = false;
  private decision: RouteDecision | null = null;
  private modelName: string | null = null;
  private limited = false;
  private changeCount = 0;
  private result: { outcome: TurnOutcome; errorCode: string | null } = { outcome: "ok", errorCode: null };
  private readonly toolCalls: ToolCallTrace[] = [];

  setRoute(route: string, rerouted = false): void {
    this.routeName = route;
    if (rerouted) this.reroutedFlag = true;
  }

  setDecision(decision: RouteDecision): void {
    this.decision = decision;
  }

  setRun(run: { modelName: string; stoppedByLimit: boolean }): void {
    this.modelName = run.modelName;
    this.limited = run.stoppedByLimit;
  }

  setChanges(count: number): void {
    this.changeCount = count;
  }

  /** O agente pediu esclarecimento em vez de gravar: turno valido, mas sem mudancas. */
  markClarification(): void {
    this.result = { outcome: "clarification", errorCode: null };
  }

  fail(error: unknown): void {
    const name = error instanceof Error ? error.constructor.name : "unknown";
    this.result = { outcome: ERROR_OUTCOMES[name] ?? "error", errorCode: name };
  }

  async tool<T>(name: string, run: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    let ok = false;
    try {
      const result = await run();
      ok = (result as { ok?: boolean } | null)?.ok !== false;
      return result;
    } finally {
      this.toolCalls.push({ name, ms: Math.round(performance.now() - startedAt), ok });
    }
  }

  toRecord(
    identity: Pick<TurnTraceRecord, "jobId" | "userId" | "actorId" | "attempt" | "sinceSubmittedMs" | "mode">,
  ): TurnTraceRecord {
    const { totalMs, ...stages } = this.summary();
    return {
      ...identity,
      route: this.routeName,
      rerouted: this.reroutedFlag,
      routeDecision: this.decision,
      model: this.modelName,
      outcome: this.result.outcome,
      errorCode: this.result.errorCode,
      stoppedByLimit: this.limited,
      changes: this.changeCount,
      totalMs,
      stages,
      tools: this.toolCalls,
    };
  }
}
