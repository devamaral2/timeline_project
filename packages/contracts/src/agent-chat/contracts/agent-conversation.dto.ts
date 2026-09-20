import type { AgentChatEntityRef } from "../../agent/contracts/agent-chat.dto";

export interface AgentConversationDto {
  id: string;
  /** Ausente enquanto ninguem renomeou: a lista cai no `preview`. */
  title?: string;
  /**
   * O comeco do primeiro pedido do usuario. E o que nomeia a conversa antes de
   * alguem renomear — sem ele a lista seria uma fila de datas iguais.
   */
  preview: string;
  lastMessageAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConversationPageDto {
  items: AgentConversationDto[];
  nextCursor?: string;
}

export interface AgentChatMessageDto {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  entities: AgentChatEntityRef[];
  createdAt: string;
}

/**
 * Uma pagina de mensagens, **da mais nova para a mais velha** — e como a
 * conversa e aberta (o fim primeiro) e como o cursor caminha para tras.
 */
export interface AgentChatMessagePageDto {
  items: AgentChatMessageDto[];
  nextCursor?: string;
}

export interface RenameAgentConversationInput {
  title: string;
  revision: number;
}
