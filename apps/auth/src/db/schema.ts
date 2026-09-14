import { boolean, inet, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const authSchemaMeta = pgTable("auth_schema_meta", {
  singleton: boolean("singleton").primaryKey().default(true),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  scope: text("scope").notNull(), subjectHash: text("subject_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }).notNull(),
  hitCount: integer("hit_count").notNull(), blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.scope, table.subjectHash] })]);
export const users = pgTable("users", {
  id: text("id").primaryKey(), email: text("email"), phone: text("phone"), name: text("name").notNull(), passwordHash: text("password_hash"),
  status: text("status").notNull(), observesUserId: text("observes_user_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email), uniqueIndex("users_phone_unique").on(t.phone)]);
export const roles = pgTable("roles", { key: text("key").primaryKey(), name: text("name").notNull(), description: text("description").notNull(), isSystem: boolean("is_system").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull() });
export const rolePermissions = pgTable("role_permissions", { roleKey: text("role_key").notNull(), permission: text("permission").notNull() }, (t) => [primaryKey({ columns: [t.roleKey, t.permission] })]);
export const userRoles = pgTable("user_roles", { userId: text("user_id").notNull(), roleKey: text("role_key").notNull() }, (t) => [primaryKey({ columns: [t.userId, t.roleKey] })]);
export const userPermissions = pgTable("user_permissions", { userId: text("user_id").notNull(), permission: text("permission").notNull(), effect: text("effect").notNull() }, (t) => [primaryKey({ columns: [t.userId, t.permission] })]);
export const signupTokens = pgTable("signup_tokens", { id: text("id").primaryKey(), jti: text("jti").notNull(), userId: text("user_id").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull() }, (t) => [uniqueIndex("signup_tokens_jti_unique").on(t.jti)]);
