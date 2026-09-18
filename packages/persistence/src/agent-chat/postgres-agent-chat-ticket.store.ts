import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AgentChatActor, AgentChatGrant, AgentChatTicketStore } from "@repo/entities/ports";
import type * as schema from "../database/schema";

/** Expirados ficam um pouco antes de sumir: so para nao apagar a cada emissao o que acabou de vencer. */
const PURGE_AFTER_EXPIRY = "5 minutes";

interface ConsumedRow extends Record<string, unknown> {
  actor: AgentChatActor;
  target_user_id: string;
  valid: boolean;
}

/**
 * Validade medida pelo relogio do banco (`now()`), e nao pelo de cada replica:
 * quem emite e quem consome podem ser processos diferentes.
 */
export class PostgresAgentChatTicketStore implements AgentChatTicketStore {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(input: { tokenHash: string; grant: AgentChatGrant; ttlSeconds: number }): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM agent_chat_tickets
      WHERE expires_at < now() - ${PURGE_AFTER_EXPIRY}::interval
    `);
    await this.db.execute(sql`
      INSERT INTO agent_chat_tickets (token_hash, actor, target_user_id, expires_at)
      VALUES (
        ${input.tokenHash},
        ${JSON.stringify(input.grant.actor)}::jsonb,
        ${input.grant.targetUserId},
        now() + make_interval(secs => ${input.ttlSeconds})
      )
    `);
  }

  async consume(tokenHash: string): Promise<AgentChatGrant | null> {
    // Apaga antes de olhar a validade: um ticket apresentado nunca serve de
    // novo, nem quando chegou atrasado.
    const result = await this.db.execute<ConsumedRow>(sql`
      DELETE FROM agent_chat_tickets
      WHERE token_hash = ${tokenHash}
      RETURNING actor, target_user_id, expires_at > now() AS valid
    `);
    const row = result.rows[0];
    if (!row?.valid) return null;
    return { actor: row.actor, targetUserId: row.target_user_id };
  }
}
