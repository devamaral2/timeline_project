import { boolean, inet, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const authSchemaMeta = pgTable("auth_schema_meta", {
  singleton: boolean("singleton").primaryKey().default(true),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(), correlationId: text("correlation_id").notNull(), actorUserId: text("actor_user_id"),
  action: text("action").notNull(), targetType: text("target_type"), targetId: text("target_id"),
  result: text("result").notNull(), reason: text("reason"), metadata: jsonb("metadata").notNull(),
  ipAddress: inet("ip_address"), userAgent: text("user_agent"), createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  scope: text("scope").notNull(), subjectHash: text("subject_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }).notNull(),
  hitCount: integer("hit_count").notNull(), blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.scope, table.subjectHash] })]);
