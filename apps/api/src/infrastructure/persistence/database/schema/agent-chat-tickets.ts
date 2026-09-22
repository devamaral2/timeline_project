import { char, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** O ator como o `GET /auth/me` o descreveu na emissao (`AgentChatActor`). */
interface TicketActorColumn {
  userId: string;
  roles?: string[];
  permissions?: string[];
  denies?: string[];
}

/**
 * Tickets de uso unico do WebSocket do chat. `token_hash` e o SHA-256 do
 * ticket — o ticket em si nunca e gravado. Vivem segundos: quem os limpa e a
 * propria emissao, apagando os expirados.
 */
export const agentChatTickets = pgTable(
  "agent_chat_tickets",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    actor: jsonb("actor").$type<TicketActorColumn>().notNull(),
    targetUserId: text("target_user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_chat_tickets_expires_idx").on(table.expiresAt)],
);
