import { AgentChatMessage, AgentConversation } from "../../../../domain";
import type { AgentChatEntityRef } from "@repo/contracts";

export interface AgentConversationRow {
  id: string;
  revision: number;
  userId: string;
  title: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentChatMessageRow {
  id: string;
  conversationId: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  entities: AgentChatEntityRef[] | null;
  createdAt: Date;
}

export function mapAgentConversationRow(row: AgentConversationRow): AgentConversation {
  return AgentConversation.rehydrate({
    id: row.id,
    userId: row.userId,
    title: row.title,
    lastMessageAt: row.lastMessageAt,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function mapAgentChatMessageRow(row: AgentChatMessageRow): AgentChatMessage {
  return AgentChatMessage.rehydrate({
    id: row.id,
    conversationId: row.conversationId,
    seq: Number(row.seq),
    role: row.role,
    content: row.content,
    entities: row.entities ?? [],
    createdAt: row.createdAt,
  });
}
