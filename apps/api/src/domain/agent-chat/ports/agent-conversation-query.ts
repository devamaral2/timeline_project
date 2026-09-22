import type {
  AgentChatMessagePageDto,
  AgentConversationPageDto,
} from "@repo/contracts";
import type { AgentChatTurn } from "@repo/contracts";

export interface AgentConversationListParams {
  userId: string;
  cursor?: string;
  limit: number;
}

export interface AgentChatMessageListParams {
  conversationId: string;
  userId: string;
  cursor?: string;
  limit: number;
}

export interface AgentChatHistoryWindowParams {
  conversationId: string;
  userId: string;
  /** Teto de turnos que o prompt aguenta (`MAX_HISTORY_TURNS`). */
  turns: number;
}

/**
 * Leitura das conversas. Separada do repositorio porque devolve DTOs e pagina
 * por cursor, como a casa ja separa `TimelineEventQuery` de `EventRepository`.
 */
export interface AgentConversationQuery {
  listConversations(params: AgentConversationListParams): Promise<AgentConversationPageDto>;
  listMessages(params: AgentChatMessageListParams): Promise<AgentChatMessagePageDto>;
  /**
   * Os ultimos turnos de uma conversa, do mais velho para o mais novo — na
   * ordem que `toConversationInput` espera.
   *
   * `null` e conversa inexistente, apagada ou de outro dono; array vazio e
   * conversa viva sem mensagem. Conflar os dois faria o `conversationId` de um
   * terceiro custar uma chamada de modelo inteira antes de o `FOR UPDATE` do
   * writer recusar — e esconderia uma falha entre usuarios atras de um estado
   * legitimo.
   */
  loadHistoryWindow(params: AgentChatHistoryWindowParams): Promise<AgentChatTurn[] | null>;
}
