import type { AgentConversation } from "../entities/agent-conversation.entity";

export interface AgentConversationRepository {
  findById(conversationId: string): Promise<AgentConversation | null>;
  rename(conversation: AgentConversation, actorUserId: string, expectedRevision: number): Promise<void>;
  /** Soft delete: apaga tambem o que pende da conversa (mensagens sao inalcancaveis). */
  delete(conversationId: string, actorUserId: string): Promise<void>;
}
