import type { AgentConversationRepository } from "@repo/entities/ports";
import type { AuthenticatedUser } from "../../auth/authenticated-user";

/**
 * Soft delete. As mensagens continuam gravadas — e ficam inalcancaveis, porque
 * toda leitura junta com a conversa filtrando `deleted_at IS NULL`.
 */
export class DeleteAgentConversationUseCase {
  constructor(private readonly conversations: Pick<AgentConversationRepository, "delete">) {}

  async execute(input: { conversationId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.conversations.delete(input.conversationId, actor.userId);
  }
}
