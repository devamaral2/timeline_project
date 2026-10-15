import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, integer, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";

export const aiJobs = pgTable("ai_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  userId: text("user_id").notNull(),
  actorId: text("actor_id").notNull(),
  payload: jsonb("payload").notNull(),
  dedupeKey: text("dedupe_key"),
  status: text("status").notNull().default("queued"),
  progress: jsonb("progress"),
  result: jsonb("result"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ai_jobs_dedupe_idx").on(t.userId, t.kind, t.dedupeKey),
  index("ai_jobs_user_idx").on(t.userId, t.createdAt),
  index("ai_jobs_recovery_idx").on(t.status, t.leaseUntil),
  check("ai_jobs_status_check", sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`),
]);

export const aiJobOutbox = pgTable("ai_job_outbox", {
  jobId: text("job_id").primaryKey().references(() => aiJobs.id, { onDelete: "cascade" }),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
});
