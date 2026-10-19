import { ulid } from "ulid";
import type { TurnTraceRecord, TurnTraceSink } from "../../../api-core/agent/services/turn-trace";
import type { PostgresDatabase } from "../database/postgres-database";

export class PostgresAiTurnTraceStore implements TurnTraceSink {
  constructor(private readonly database: PostgresDatabase) {}

  async record(trace: TurnTraceRecord): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO ai_turn_traces (id,job_id,user_id,actor_id,attempt,since_submitted_ms,mode,route,rerouted,
        route_decision,model,outcome,error_code,stopped_by_limit,changes,total_ms,stages,tools)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)`,
      [
        ulid(), trace.jobId, trace.userId, trace.actorId, trace.attempt, trace.sinceSubmittedMs, trace.mode,
        trace.route, trace.rerouted, trace.routeDecision ? JSON.stringify(trace.routeDecision) : null,
        trace.model, trace.outcome, trace.errorCode, trace.stoppedByLimit, trace.changes, trace.totalMs,
        JSON.stringify(trace.stages), JSON.stringify(trace.tools),
      ],
    );
  }
}
