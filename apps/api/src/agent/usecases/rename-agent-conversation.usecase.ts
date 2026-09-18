import { AgentConversationNotFoundError } from "@repo/entities";
import type { AgentConversationRepository } from "@repo/entities/ports";
import type { AuthenticatedUser } from "../../auth/authenticated-user";

export class RenameAgentConversationUseCase {
  constructor(private readonly conversations: AgentConversationRepository) {}

  async execute(
    input: { conversationId: string; title: string; revision: number },
    actor: AuthenticatedUser,
  ): Promise<void> {
    const current = await this.conversations.findById(input.conversationId);
    if (!current || current.userId !== actor.userId) {
      throw new AgentConversationNotFoundError(`Conversation not found: ${input.conversationId}`);
    }

    await this.conversations.rename(
      current.revise({ title: input.title }),
      actor.userId,
      input.revision,
    );
  }
}
