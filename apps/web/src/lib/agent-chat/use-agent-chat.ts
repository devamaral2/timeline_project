"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChatEntityRef, AgentChatTurn, AgentScreenContext } from "@/lib/api/contracts";
import { AgentChatClient, type AgentChatClientOptions, type AgentChatEvent } from "./agent-chat-client";

export type AgentChatMessage =
  | { id: string; role: "user"; text: string; failed?: boolean }
  | { id: string; role: "assistant"; text: string; entities: AgentChatEntityRef[] }
  | { id: string; role: "error"; text: string; retryText: string };

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
}

const HISTORY_TURNS = 20;

const ERROR_TEXTS: Record<Extract<AgentChatEvent, { type: "error" }>["code"], string> = {
  busy: "Ainda estou respondendo a mensagem anterior.",
  invalid_frame: "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
  invalid_input: "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
  forbidden: "Você não tem permissão para acessar esses dados.",
  limit_reached: "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores.",
  conflict: "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
  unavailable: "A IA está indisponível agora. Tente de novo em instantes.",
  cancelled: "Cancelado. Nada foi gravado.",
  internal: "Algo deu errado. Tente de novo.",
  connection_lost:
    "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.",
  connection_failed: "Não consegui conectar ao assistente. Tente de novo.",
  session_expired: "Sua sessão acabou. Entre de novo para continuar.",
};

let messageCounter = 0;

function nextMessageId(): string {
  messageCounter += 1;
  return `m${Date.now().toString(36)}${messageCounter.toString(36)}`;
}

/** O que ja foi dito, para o agente entender "ela". Pedidos que falharam ficam de fora. */
export function historyOf(messages: readonly AgentChatMessage[]): AgentChatTurn[] {
  const turns: AgentChatTurn[] = [];
  for (const message of messages) {
    if (message.role === "user" && !message.failed) turns.push({ role: "user", text: message.text });
    if (message.role === "assistant") {
      turns.push({
        role: "assistant",
        text: message.text,
        ...(message.entities.length ? { entities: message.entities } : {}),
      });
    }
  }
  return turns.slice(-HISTORY_TURNS);
}

/**
 * A conversa da pagina com o agente. Vive enquanto o componente vive: nada e
 * guardado entre recarregamentos.
 */
export function useAgentChat({ userId, context, onEntitiesChanged, createClient }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [pending, setPending] = useState<AgentChatPending | null>(null);
  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
  const clientRef = useRef<Pick<AgentChatClient, "send" | "cancel" | "close"> | null>(null);
  const onEntitiesChangedRef = useRef(onEntitiesChanged);

  useEffect(() => {
    onEntitiesChangedRef.current = onEntitiesChanged;
  }, [onEntitiesChanged]);

  const commitMessages = useCallback((update: (current: AgentChatMessage[]) => AgentChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const commitPending = useCallback((next: AgentChatPending | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const handleEvent = useCallback(
    (event: AgentChatEvent) => {
      if (pendingRef.current?.id !== event.id) return;

      if (event.type === "status") {
        if (!pendingRef.current.cancelling) commitPending({ id: event.id, label: event.label });
        return;
      }

      commitPending(null);
      if (event.type === "reply") {
        commitMessages((current) => [
          ...current,
          { id: `${event.id}-reply`, role: "assistant", text: event.agentResponse, entities: event.entities },
        ]);
        if (event.entities.length) onEntitiesChangedRef.current?.();
        return;
      }

      const request = messagesRef.current.find((message) => message.id === event.id);
      commitMessages((current) => [
        ...current.map((message) =>
          message.id === event.id && message.role === "user" ? { ...message, failed: true } : message,
        ),
        { id: `${event.id}-error`, role: "error", text: ERROR_TEXTS[event.code], retryText: request?.text ?? "" },
      ]);
      if (event.code === "connection_lost") onEntitiesChangedRef.current?.();
    },
    [commitMessages, commitPending],
  );

  useEffect(() => {
    if (!userId) return;
    const options: AgentChatClientOptions = { userId, onEvent: handleEvent };
    const client = createClient ? createClient(options) : new AgentChatClient(options);
    clientRef.current = client;
    return () => {
      client.close();
      clientRef.current = null;
      commitPending(null);
    };
  }, [commitPending, createClient, handleEvent, userId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const client = clientRef.current;
      if (!trimmed || !client || pendingRef.current) return false;

      const id = nextMessageId();
      const history = historyOf(messagesRef.current);
      commitMessages((current) => [...current, { id, role: "user", text: trimmed }]);
      commitPending({ id });
      void client.send({ id, text: trimmed, context, history });
      return true;
    },
    [commitMessages, commitPending, context],
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
      const requestId = errorId.replace(/-error$/, "");
      commitMessages((current) => current.filter((message) => message.id !== errorId && message.id !== requestId));
      send(error.retryText);
    },
    [commitMessages, send],
  );

  return { messages, pending, ready: Boolean(userId), send, cancel, retry };
}
