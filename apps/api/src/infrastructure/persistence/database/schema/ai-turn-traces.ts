import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Uma linha por tentativa de turno do agente, gravada tambem quando o turno
 * falha ou estoura o tempo. So numeros, nomes de etapa e codigos: nunca o texto
 * do usuario nem o do modelo. Nao ha FK para `ai_jobs`: a trilha sobrevive a
 * limpeza do job e uma falha ao grava-la nunca pode afetar o turno.
 */
export const aiTurnTraces = pgTable("ai_turn_traces", {
  id: text("id").primaryKey(),
  jobId: text("job_id"),
  userId: text("user_id").notNull(),
  actorId: text("actor_id").notNull(),
  attempt: integer("attempt"),
  sinceSubmittedMs: integer("since_submitted_ms"),
  mode: text("mode").notNull(),
  route: text("route").notNull(),
  rerouted: boolean("rerouted").notNull().default(false),
  routeDecision: jsonb("route_decision"),
  model: text("model"),
  outcome: text("outcome").notNull(),
  errorCode: text("error_code"),
  stoppedByLimit: boolean("stopped_by_limit").notNull().default(false),
  changes: integer("changes").notNull().default(0),
  totalMs: integer("total_ms").notNull(),
  stages: jsonb("stages").notNull(),
  tools: jsonb("tools").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_turn_traces_created_idx").on(t.createdAt),
  index("ai_turn_traces_user_idx").on(t.userId, t.createdAt),
  index("ai_turn_traces_job_idx").on(t.jobId),
]);
