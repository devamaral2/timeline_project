"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentConversationDto } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/authed-fetch";
import { deleteConversation, fetchConversations } from "./agent-conversations-api";

interface UseAgentConversationsOptions {
  /** Sem usuario nada e buscado: a sessao ainda nao respondeu, ou ninguem entrou. */
  userId: string | undefined;
  load?: typeof fetchConversations | undefined;
  remove?: typeof deleteConversation | undefined;
}

/**
 * A lista de conversas do usuario. So leitura e remocao — comecar uma conversa
 * e estado local do chat, porque a conversa so nasce no primeiro turno gravado.
 */
export function useAgentConversations({
  userId,
  load = fetchConversations,
  remove = deleteConversation,
}: UseAgentConversationsOptions) {
  const [conversations, setConversations] = useState<AgentConversationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const removeRef = useRef(remove);

  useEffect(() => {
    loadRef.current = load;
    removeRef.current = remove;
  }, [load, remove]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await loadRef.current();
      setConversations(page.items);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? "Sua sessão não está válida. Entre novamente para carregar suas conversas."
          : "Não foi possível carregar suas conversas.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const forget = useCallback(async (conversationId: string) => {
    // Sai da lista antes da resposta: apagar e a acao mais obvia da tela e
    // esperar o servidor para ela parecer travado.
    setConversations((current) => current.filter((item) => item.id !== conversationId));
    await removeRef.current(conversationId);
  }, []);

  return { conversations, loading, error, refresh, forget };
}
