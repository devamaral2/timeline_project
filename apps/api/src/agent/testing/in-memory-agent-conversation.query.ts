import type {
  AgentChatHistoryWindowParams,
  AgentChatMessageListParams,
  AgentConversationListParams,
  AgentConversationQuery,
} from "@repo/entities/ports";
import type {
  AgentChatMessagePageDto,
  AgentChatTurn,
  AgentConversationPageDto,
} from "@repo/entities/contracts";

/**
 * Conversas em memoria para os testes da API. Guarda so o que o caminho do
 * chat le: a janela de historico, e se a conversa existe para aquele dono —
 * `null` e o que distingue "nao e sua" de "ainda nao tem mensagem".
 */
export class InMemoryAgentConversationQuery implements AgentConversationQuery {
  private readonly turns = new Map<string, { userId: string; turns: AgentChatTurn[] }>();

  seed(conversationId: string, userId: string, turns: AgentChatTurn[] = []): void {
    this.turns.set(conversationId, { userId, turns });
  }

  async listConversations(_params: AgentConversationListParams): Promise<AgentConversationPageDto> {
    return { items: [] };
  }

  async listMessages(_params: AgentChatMessageListParams): Promise<AgentChatMessagePageDto> {
    return { items: [] };
  }

  async loadHistoryWindow(params: AgentChatHistoryWindowParams): Promise<AgentChatTurn[] | null> {
    const found = this.turns.get(params.conversationId);
    if (!found || found.userId !== params.userId) return null;
    return found.turns.slice(-params.turns);
  }
}
