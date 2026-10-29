import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Um pedido ao dialogo com a IA pela rota por processo. O processo nasce antes
 * de qualquer entidade e fica ligado a cada uma que seus passos criam ou editam.
 * `dispatch` guarda so escolhas e confiancas do JEV, nunca o texto do usuario
 * alem do proprio `prompt`, que e o pedido.
 */
export const aiProcesses = pgTable("ai_processes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  actorId: text("actor_id").notNull(),
  prompt: text("prompt").notNull(),
  context: jsonb("context"),
  status: text("status").notNull().default("dispatching"),
  dispatch: jsonb("dispatch"),
  response: jsonb("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("ai_processes_user_idx").on(t.userId, t.createdAt),
  check("ai_processes_status_check", sql`${t.status} in ('dispatching','running','completed','failed')`),
]);

/** Um trabalho do processo, entregue a uma fila propria. */
export const aiProcessSteps = pgTable("ai_process_steps", {
  id: text("id").primaryKey(),
  processId: text("process_id").notNull().references(() => aiProcesses.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  expected: text("expected").notNull().default("one"),
  payload: jsonb("payload"),
  jobId: text("job_id"),
  status: text("status").notNull().default("pending"),
  errorCode: text("error_code"),
  result: jsonb("result"),
  timings: jsonb("timings"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("ai_process_steps_process_idx").on(t.processId),
  check("ai_process_steps_status_check", sql`${t.status} in ('pending','running','succeeded','failed')`),
]);

/** A entidade que um passo criou ou editou, e o que a finalizacao ja fez com ela. */
export const aiProcessEntities = pgTable("ai_process_entities", {
  processId: text("process_id").notNull().references(() => aiProcesses.id, { onDelete: "cascade" }),
  entityKind: text("entity_kind").notNull(),
  entityId: text("entity_id").notNull(),
  stepId: text("step_id").notNull().references(() => aiProcessSteps.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  /** Nome e dados curtos que a finalizacao mostra ao JEV; nunca o texto bruto do pedido. */
  summary: jsonb("summary").notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  links: jsonb("links").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.processId, t.entityKind, t.entityId] }),
  index("ai_process_entities_step_idx").on(t.stepId),
]);
