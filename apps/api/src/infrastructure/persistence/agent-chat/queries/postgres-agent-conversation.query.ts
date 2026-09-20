import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AgentChatEntityRef,
  AgentChatMessagePageDto,
  AgentChatTurn,
  AgentConversationPageDto,
} from "@repo/contracts";
import type {
  AgentChatHistoryWindowParams,
  AgentChatMessageListParams,
  AgentConversationListParams,
  AgentConversationQuery,
} from "../../../../domain/ports";
import * as schema from "../../database/schema";
import {
  decodeAgentChatMessageCursor,
  decodeAgentConversationCursor,
  encodeAgentChatMessageCursor,
  encodeAgentConversationCursor,
} from "./agent-chat-cursors";

/** Quanto do primeiro pedido nomeia a conversa na lista. */
const PREVIEW_CHARS = 80;

interface ConversationRow extends Record<string, unknown> {
  id: string;
  title: string | null;
  preview: string | null;
  last_message_at: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface MessageRow extends Record<string, unknown> {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  entities: AgentChatEntityRef[] | null;
  created_at: string;
}

/**
 * Leitura das conversas. Toda query junta com `agent_conversations` filtrando
 * dono e `deleted_at IS NULL` — e o que torna as mensagens de uma conversa
 * apagada inalcancaveis sem precisar apagar linha por linha.
 */
export class PostgresAgentConversationQuery implements AgentConversationQuery {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listConversations(params: AgentConversationListParams): Promise<AgentConversationPageDto> {
    const limitPlusOne = params.limit + 1;
    const conditions: SQL[] = [
      sql`c.user_id = ${params.userId}`,
      sql`c.deleted_at IS NULL`,
    ];

    if (params.cursor) {
      const cursor = decodeAgentConversationCursor(params.cursor);
      conditions.push(sql`(c.last_message_at, c.id) < (${cursor.lastMessageAt}, ${cursor.id})`);
    }

    // O primeiro pedido do usuario vem junto: e o nome da conversa enquanto
    // ninguem a renomeou. `LIMIT 1` por linha da pagina, servido pelo indice
    // unico `(conversation_id, seq)`.
    const result = await this.db.execute<ConversationRow>(sql`
      SELECT c.id, c.title, c.last_message_at, c.revision, c.created_at, c.updated_at, first_ask.content AS preview
      FROM agent_conversations c
      LEFT JOIN LATERAL (
        SELECT m.content
        FROM agent_chat_messages m
        WHERE m.conversation_id = c.id AND m.role = 'user'
        ORDER BY m.seq
        LIMIT 1
      ) AS first_ask ON true
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY c.last_message_at DESC, c.id DESC
      LIMIT ${limitPlusOne}
    `);

    const hasNextPage = result.rows.length > params.limit;
    const rows = result.rows.slice(0, params.limit);
    if (rows.length === 0) return { items: [] };

    const lastRow = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title ?? undefined,
        preview: truncatePreview(row.preview ?? ""),
        lastMessageAt: new Date(row.last_message_at).toISOString(),
        revision: Number(row.revision),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      nextCursor:
        hasNextPage && lastRow
          ? encodeAgentConversationCursor({
              lastMessageAt: new Date(lastRow.last_message_at),
              id: lastRow.id,
            })
          : undefined,
    };
  }

  async listMessages(params: AgentChatMessageListParams): Promise<AgentChatMessagePageDto> {
    const limitPlusOne = params.limit + 1;
    const conditions: SQL[] = [
      sql`m.conversation_id = ${params.conversationId}`,
      sql`c.user_id = ${params.userId}`,
      sql`c.deleted_at IS NULL`,
    ];

    if (params.cursor) {
      conditions.push(sql`m.seq < ${decodeAgentChatMessageCursor(params.cursor)}`);
    }

    const result = await this.db.execute<MessageRow>(sql`
      SELECT m.id, m.seq, m.role, m.content, m.entities, m.created_at
      FROM agent_chat_messages m
      JOIN agent_conversations c ON c.id = m.conversation_id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY m.seq DESC
      LIMIT ${limitPlusOne}
    `);

    const hasNextPage = result.rows.length > params.limit;
    const rows = result.rows.slice(0, params.limit);
    if (rows.length === 0) return { items: [] };

    const lastRow = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        seq: Number(row.seq),
        role: row.role,
        content: row.content,
        entities: row.entities ?? [],
        createdAt: new Date(row.created_at).toISOString(),
      })),
      nextCursor:
        hasNextPage && lastRow ? encodeAgentChatMessageCursor(Number(lastRow.seq)) : undefined,
    };
  }

  async loadHistoryWindow(params: AgentChatHistoryWindowParams): Promise<AgentChatTurn[] | null> {
    // A existencia e conferida a parte de proposito: sem isso, um
    // `conversationId` de terceiro devolveria "vazio" e so seria recusado no
    // `FOR UPDATE` do commit — depois de uma chamada de modelo inteira.
    const owned = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM agent_conversations
      WHERE id = ${params.conversationId}
        AND user_id = ${params.userId}
        AND deleted_at IS NULL
    `);
    if (owned.rows.length === 0) return null;

    if (params.turns <= 0) return [];

    // Os mais recentes primeiro para o `LIMIT` cortar o comeco da conversa, que
    // e o que `toConversationInput` descartaria de qualquer jeito; a ordem e
    // desfeita logo abaixo, porque o prompt le do mais velho para o mais novo.
    const result = await this.db.execute<MessageRow>(sql`
      SELECT m.id, m.seq, m.role, m.content, m.entities, m.created_at
      FROM agent_chat_messages m
      JOIN agent_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ${params.conversationId}
        AND c.user_id = ${params.userId}
        AND c.deleted_at IS NULL
      ORDER BY m.seq DESC
      LIMIT ${params.turns}
    `);

    return result.rows.reverse().map((row) => ({
      role: row.role,
      text: row.content,
      entities: row.entities ?? undefined,
    }));
  }
}

function truncatePreview(content: string): string {
  const text = content.trim();
  return text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS - 1)}…`;
}
