import type { AgentConversationPageDto } from "@repo/contracts";
import type { AgentConversationQuery } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const DEFAULT_LIMIT = 30;

/** As conversas sao sempre as do proprio ator: nao ha listagem de terceiros. */
export class ListAgentConversationsUseCase {
  constructor(private readonly conversations: Pick<AgentConversationQuery, "listConversations">) {}

  async execute(
    input: { cursor?: string; limit?: number },
    actor: AuthenticatedUser,
  ): Promise<AgentConversationPageDto> {
    return this.conversations.listConversations({
      userId: actor.userId,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
  }
}
