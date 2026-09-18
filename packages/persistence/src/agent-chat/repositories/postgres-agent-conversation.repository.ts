import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  AgentConversation,
  AgentConversationNotFoundError,
  AgentConversationOwnershipError,
  AgentConversationRevisionConflictError,
  EntityBatchConflictError,
  type AgentChatMessage,
} from "@repo/entities";
import type { AgentConversationRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { mapAgentConversationRow } from "../mappers/agent-conversation-row.mapper";
import type { Tx } from "../../events/repositories/postgres-event.repository";

export async function insertConversation(tx: Tx, conversation: AgentConversation): Promise<void> {
  await tx.insert(schema.agentConversations).values({
    id: conversation.id,
    revision: conversation.revision,
    userId: conversation.userId,
    title: conversation.title ?? null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });
}

/**
 * Trava a linha da conversa e devolve o proximo `seq` livre. E esta trava — e
 * nao a revisao — que serializa duas abas conversando na mesma thread: anexar
 * nao e um conflito, so precisa de ordem.
 *
 * Conversa inexistente, de outro dono ou ja apagada e conflito de lote: o
 * turno inteiro (mensagens e entidades) nao entra.
 */
export async function lockConversationForAppend(
  tx: Tx,
  conversationId: string,
  userId: string,
): Promise<number> {
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT id FROM agent_conversations
    WHERE id = ${conversationId} AND user_id = ${userId} AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (locked.rows.length === 0) {
    throw new EntityBatchConflictError(
      `agent_conversations: ${conversationId} não existe mais ou não pertence ao usuário`,
    );
  }

  const [next] = (
    await tx.execute<{ next_seq: number }>(sql`
      SELECT coalesce(max(seq), 0) + 1 AS next_seq
      FROM agent_chat_messages
      WHERE conversation_id = ${conversationId}
    `)
  ).rows;
  return Number(next?.next_seq ?? 1);
}

/** Grava as mensagens em sequencia a partir de `startSeq` e move `last_message_at`. */
export async function appendMessages(
  tx: Tx,
  conversationId: string,
  messages: readonly AgentChatMessage[],
  startSeq: number,
): Promise<void> {
  if (messages.length === 0) return;

  await tx.insert(schema.agentChatMessages).values(
    messages.map((message, offset) => ({
      id: message.id,
      conversationId,
      seq: startSeq + offset,
      role: message.role,
      content: message.content,
      entities: [...message.entities],
      createdAt: message.createdAt,
    })),
  );

  await tx
    .update(schema.agentConversations)
    .set({ lastMessageAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.agentConversations.id, conversationId));
}

export async function renameConversation(
  tx: Tx,
  conversation: AgentConversation,
  actorUserId: string,
  expectedRevision: number,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE agent_conversations
    SET title = ${conversation.title ?? null},
        revision = ${conversation.revision},
        updated_at = now()
    WHERE id = ${conversation.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length > 0) return;

  const [existing] = await tx
    .select({
      userId: schema.agentConversations.userId,
      revision: schema.agentConversations.revision,
    })
    .from(schema.agentConversations)
    .where(
      and(
        eq(schema.agentConversations.id, conversation.id),
        isNull(schema.agentConversations.deletedAt),
      ),
    );

  classifyUpdateFailure(existing, actorUserId, expectedRevision, {
    notFound: () => new AgentConversationNotFoundError(`Conversation not found: ${conversation.id}`),
    ownership: () => new AgentConversationOwnershipError(),
    conflict: (message) => new AgentConversationRevisionConflictError(message),
  });
}

/**
 * Soft delete. As mensagens ficam na tabela — o `cascade` do FK nao dispara num
 * UPDATE — e somem porque toda leitura junta com a conversa filtrando
 * `deleted_at IS NULL`.
 */
export async function softDeleteConversation(
  tx: Tx,
  conversationId: string,
  actorUserId: string,
): Promise<void> {
  const [existing] = await tx
    .select({ userId: schema.agentConversations.userId })
    .from(schema.agentConversations)
    .where(
      and(
        eq(schema.agentConversations.id, conversationId),
        isNull(schema.agentConversations.deletedAt),
      ),
    );

  if (!existing) throw new AgentConversationNotFoundError(`Conversation not found: ${conversationId}`);
  if (existing.userId !== actorUserId) throw new AgentConversationOwnershipError();

  await tx
    .update(schema.agentConversations)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.agentConversations.id, conversationId));
}

export class PostgresAgentConversationRepository implements AgentConversationRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async findById(conversationId: string): Promise<AgentConversation | null> {
    const [row] = await this.db
      .select()
      .from(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, conversationId),
          isNull(schema.agentConversations.deletedAt),
        ),
      );
    return row ? mapAgentConversationRow(row) : null;
  }

  async rename(
    conversation: AgentConversation,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await renameConversation(tx, conversation, actorUserId, expectedRevision);
    });
  }

  async delete(conversationId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteConversation(tx, conversationId, actorUserId);
    });
  }
}
