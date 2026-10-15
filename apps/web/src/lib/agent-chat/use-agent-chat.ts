"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChatEntityRef, AgentChatMessageDto, AgentScreenContext } from "@/lib/api/contracts";
import type { AgentChatClient, AgentChatClientOptions, AgentChatEvent } from "./agent-chat-client";
import { DurableAgentChatClient } from "./durable-agent-chat-client";
import { operationId } from "@/lib/ai-jobs/ai-jobs";
import { fetchConversationMessages } from "./agent-conversations-api";

export type AgentChatMessage =
  | { id: string; role: "user"; text: string; failed?: boolean }
  | { id: string; role: "assistant"; text: string; entities: AgentChatEntityRef[] }
  | { id: string; role: "error"; text: string; retryText: string; requestId: string };

export interface AgentChatPending {
  id: string;
  label?: string;
  /** Parar ja foi pedido; o servidor so confirma quando a ferramenta em curso termina. */
  cancelling?: boolean;
}

interface UseAgentChatOptions {
  /** Sem usuario (sessao ainda nao respondeu, ou ninguem entrou) nada e enviado. */
  userId: string | undefined;
  context?: AgentScreenContext;
  /** Chamado quando uma resposta mexeu em registros — ou pode ter mexido. */
  onEntitiesChanged?: () => void;
  createClient?: (options: AgentChatClientOptions) => Pick<AgentChatClient, "send" | "cancel" | "close">;
  loadMessages?: typeof fetchConversationMessages | undefined;
}

const ERROR_TEXTS: Record<Extract<AgentChatEvent, { type: "error" }>["code"], string> = {
  busy: "Ainda estou respondendo a mensagem anterior.",
  invalid_frame: "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
  invalid_input: "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
  forbidden: "Você não tem permissão para acessar esses dados.",
  limit_reached: "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores.",
  conflict: "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
  conversation_gone: "Esta conversa não existe mais. Sua mensagem não foi enviada — comece outra.",
  unavailable: "A IA está indisponível agora. Tente de novo em instantes.",
  cancelled: "Pedido cancelado.",
  internal: "Algo deu errado. Tente de novo.",
  connection_lost:
    "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.",
  connection_failed: "Não consegui conectar ao assistente. Tente de novo.",
  session_expired: "Sua sessão acabou. Entre de novo para continuar.",
};

/** Cada turno gravado sao duas mensagens: o pedido e a resposta. */
const TURN_SIZE = 2;

function toMessage(dto: AgentChatMessageDto): AgentChatMessage {
  return dto.role === "user"
    ? { id: dto.id, role: "user", text: dto.content }
    : { id: dto.id, role: "assistant", text: dto.content, entities: dto.entities };
}

/**
 * A conversa aberta com o agente.
 *
 * O historico deixou de ser do cliente: quem o guarda e o servidor, e o que
 * esta aqui e o cache da conversa aberta. O socket leva so o id da conversa —
 * uma conversa nova nao tem id nenhum ate o primeiro turno ser gravado, e e o
 * `reply` que o traz.
 */
export function useAgentChat({
  userId,
  context,
  onEntitiesChanged,
  createClient,
  loadMessages = fetchConversationMessages,
}: UseAgentChatOptions) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [pending, setPending] = useState<AgentChatPending | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
  const conversationRef = useRef(conversationId);
  /** Ultimo `seq` conhecido desta conversa; 0 enquanto ela e nova. */
  const lastSeqRef = useRef(0);
  const reloadVersionRef = useRef(0);
  const clientRef = useRef<Pick<AgentChatClient, "send" | "cancel" | "close"> | null>(null);
  const onEntitiesChangedRef = useRef(onEntitiesChanged);
  const loadMessagesRef = useRef(loadMessages);

  useEffect(() => {
    onEntitiesChangedRef.current = onEntitiesChanged;
    loadMessagesRef.current = loadMessages;
  }, [loadMessages, onEntitiesChanged]);

  const commitMessages = useCallback((update: (current: AgentChatMessage[]) => AgentChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const commitPending = useCallback((next: AgentChatPending | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const commitConversation = useCallback((next: string | null) => {
    conversationRef.current = next;
    setConversationId(next);
  }, []);

  /**
   * Recarrega a thread do servidor. Balao local que falhou fica de fora: ele
   * nunca chegou a ser gravado, e mante-lo ao lado do que o servidor devolveu
   * faria a lista afirmar uma mensagem que nao existe.
   */
  const reload = useCallback(
    async (id: string, recoveringRequestId?: string) => {
      const version = ++reloadVersionRef.current;
      setLoading(true);
      try {
        const page = await loadMessagesRef.current(id);
        if (conversationRef.current !== id || reloadVersionRef.current !== version) return;
        const ordered = [...page.items].reverse();
        // A recovered turn isn't canonical until it commits. Keep its local
        // bubble and any failure/retry state during this first history load.
        const local = recoveringRequestId ? messagesRef.current.filter((message) =>
          message.id === recoveringRequestId || message.id === `${recoveringRequestId}-error`) : [];
        messagesRef.current = [...ordered.map(toMessage), ...local];
        setMessages(messagesRef.current);
        lastSeqRef.current = ordered.at(-1)?.seq ?? 0;
      } finally {
        if (reloadVersionRef.current === version) setLoading(false);
      }
    },
    [],
  );

  const openConversation = useCallback(
    async (id: string) => {
      if (pendingRef.current) return;
      commitConversation(id);
      commitPending(null);
      await reload(id);
    },
    [commitConversation, commitPending, reload],
  );

  /** Comecar de novo e estado local: a conversa so nasce no primeiro turno gravado. */
  const startNewConversation = useCallback(() => {
    if (pendingRef.current) return;
    commitConversation(null);
    commitPending(null);
    lastSeqRef.current = 0;
    messagesRef.current = [];
    setMessages([]);
  }, [commitConversation, commitPending]);

  const handleEvent = useCallback(
    (event: AgentChatEvent) => {
      if (pendingRef.current?.id !== event.id) return;

      if (event.type === "status") {
        if (!pendingRef.current.cancelling) commitPending({ id: event.id, label: event.label });
        return;
      }

      commitPending(null);
      if (event.type === "reply") {
        const startedFresh = lastSeqRef.current === 0;
        commitConversation(event.conversationId);

        // Durable jobs are persisted before completion. Replace the local
        // optimistic turn with canonical history, including on page recovery.
        if (!createClient) {
          void reload(event.conversationId).catch(() => {
            commitMessages((current) => current.some((message) => message.id === `${event.id}-reply`)
              ? current : [...current, { id: `${event.id}-reply`, role: "assistant",
                text: event.agentResponse, entities: event.entities }]);
          });
          onEntitiesChangedRef.current?.();
          return;
        }

        // Um salto no `seq` so acontece se outra aba escreveu nesta conversa no
        // meio do turno: o que esta na tela ja nao e a conversa inteira.
        const expected = lastSeqRef.current + TURN_SIZE;
        if (!startedFresh && event.assistantSeq !== expected) {
          lastSeqRef.current = event.assistantSeq;
          void reload(event.conversationId);
          if (event.entities.length) onEntitiesChangedRef.current?.();
          return;
        }

        lastSeqRef.current = event.assistantSeq;
        commitMessages((current) => [
          ...current,
          { id: `${event.id}-reply`, role: "assistant", text: event.agentResponse, entities: event.entities },
        ]);
        if (event.entities.length) onEntitiesChangedRef.current?.();
        return;
      }

      // A conversa sumiu debaixo do cliente: o id local nao serve mais para nada.
      if (event.code === "conversation_gone") commitConversation(null);

      const request = messagesRef.current.find((message) => message.id === event.id);
      commitMessages((current) => [
        ...current.map((message) =>
          message.id === event.id && message.role === "user" ? { ...message, failed: true } : message,
        ),
        {
          id: `${event.id}-error`,
          role: "error",
          text: ERROR_TEXTS[event.code],
          retryText: request?.text ?? "",
          requestId: event.id,
        },
      ]);
      if (event.code === "connection_lost") onEntitiesChangedRef.current?.();
    },
    [commitConversation, commitMessages, commitPending, createClient, reload],
  );

  useEffect(() => {
    if (!userId) return;
    const options: AgentChatClientOptions = { userId, onEvent: handleEvent };
    const client = createClient ? createClient(options) : new DurableAgentChatClient({
      ...options,
      onRecover: (job) => {
        if (pendingRef.current || conversationRef.current || messagesRef.current.length) return false;
        const id = job.request?.clientMessageId ?? job.id;
        commitPending({ id, label: job.progress ?? "Recuperando pedido" });
        commitMessages(() => [{ id, role: "user", text: job.request?.text ?? "" }]);
        if (job.request?.conversationId) {
          commitConversation(job.request.conversationId);
          // Keep the uncommitted request while loading older canonical turns.
          void reload(job.request.conversationId, id).catch(() => {});
        }
        return true;
      },
    });
    clientRef.current = client;
    return () => {
      client.close();
      clientRef.current = null;
      commitPending(null);
    };
  }, [commitConversation, commitMessages, commitPending, createClient, handleEvent, reload, userId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const client = clientRef.current;
      if (!trimmed || !client || pendingRef.current || loading) return false;

      const id = operationId();
      commitMessages((current) => [...current, { id, role: "user", text: trimmed }]);
      commitPending({ id });
      void client.send({
        id,
        text: trimmed,
        context,
        ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
      });
      return true;
    },
    [commitMessages, commitPending, context, loading],
  );

  const cancel = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.cancelling) return;
    clientRef.current?.cancel(current.id);
    commitPending({ id: current.id, label: "Cancelando", cancelling: true });
  }, [commitPending]);

  /** Tira o pedido que falhou e o erro dele, e manda o texto de novo. */
  const retry = useCallback(
    (errorId: string) => {
      const error = messagesRef.current.find((message) => message.id === errorId);
      if (error?.role !== "error" || pendingRef.current) return;
      const { requestId } = error;
      commitMessages((current) => current.filter((message) => message.id !== errorId && message.id !== requestId));
      send(error.retryText);
    },
    [commitMessages, send],
  );

  return {
    messages,
    pending,
    conversationId,
    loading,
    ready: Boolean(userId),
    send,
    cancel,
    retry,
    openConversation,
    startNewConversation,
  };
}
