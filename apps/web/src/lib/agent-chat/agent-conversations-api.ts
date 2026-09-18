import { authedFetch } from "@/lib/api/authed-fetch";
import type {
  AgentChatMessagePageDto,
  AgentConversationPageDto,
} from "@/lib/api/contracts";

/**
 * A leitura das conversas e REST, e nao pelo socket: o frame do chat e
 * limitado a 64 KiB e a conexao morre a cada 15 min. O socket ficou so com o
 * comando; paginar historico por la seria brigar com os dois limites.
 */
export function fetchConversations(cursor?: string): Promise<AgentConversationPageDto> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authedFetch<AgentConversationPageDto>(`/api/ai/conversations${query}`);
}

export function fetchConversationMessages(
  conversationId: string,
  cursor?: string,
): Promise<AgentChatMessagePageDto> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authedFetch<AgentChatMessagePageDto>(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
  );
}

export function renameConversation(
  conversationId: string,
  title: string,
  revision: number,
): Promise<void> {
  return authedFetch<void>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, revision }),
  });
}

export function deleteConversation(conversationId: string): Promise<void> {
  return authedFetch<void>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}
