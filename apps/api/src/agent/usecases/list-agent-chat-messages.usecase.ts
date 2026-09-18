import type { AgentChatMessagePageDto } from "@repo/entities/contracts";
import type { AgentConversationQuery } from "@repo/entities/ports";
import type { AuthenticatedUser } from "../../auth/authenticated-user";

const DEFAULT_LIMIT = 50;

/**
 * Uma pagina de mensagens, da mais nova para a mais velha — e como a conversa
 * e aberta. O filtro de dono esta na query, junto com o de conversa apagada.
 */
export class ListAgentChatMessagesUseCase {
  constructor(private readonly conversations: Pick<AgentConversationQuery, "listMessages">) {}

  async execute(
    input: { conversationId: string; cursor?: string; limit?: number },
    actor: AuthenticatedUser,
  ): Promise<AgentChatMessagePageDto> {
    return this.conversations.listMessages({
      conversationId: input.conversationId,
      userId: actor.userId,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
  }
}
