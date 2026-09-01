import { boolean, inet, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
export const users = pgTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), name: text("name").notNull(), passwordHash: text("password_hash"),
  phoneE164: text("phone_e164"), phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }), mfaChannel: text("mfa_channel"),
  status: text("status").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);
export const roles = pgTable("roles", { key: text("key").primaryKey(), name: text("name").notNull(), description: text("description").notNull(), isSystem: boolean("is_system").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull() });
export const rolePermissions = pgTable("role_permissions", { roleKey: text("role_key").notNull(), permission: text("permission").notNull() }, (t) => [primaryKey({ columns: [t.roleKey, t.permission] })]);
export const userRoles = pgTable("user_roles", { userId: text("user_id").notNull(), roleKey: text("role_key").notNull() }, (t) => [primaryKey({ columns: [t.userId, t.roleKey] })]);
export const userPermissions = pgTable("user_permissions", { userId: text("user_id").notNull(), permission: text("permission").notNull(), effect: text("effect").notNull() }, (t) => [primaryKey({ columns: [t.userId, t.permission] })]);
export const invites = pgTable("invites", { id: text("id").primaryKey(), tokenHash: text("token_hash").notNull(), userId: text("user_id").notNull(), issuerUserId: text("issuer_user_id"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), acceptedAt: timestamp("accepted_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull() });
