import { char, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Chaves de idempotencia das rotas de criacao (header `Idempotency-Key`) e do
 * reenvio da mesma mensagem a IA. `response` nulo significa "em andamento";
 * preenchido, e a resposta a repetir.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    userId: text("user_id").notNull(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.scope, table.key] }),
    index("idempotency_keys_created_idx").on(table.createdAt),
  ],
);
