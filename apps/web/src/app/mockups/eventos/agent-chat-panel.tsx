"use client";

import { MessagesSquare, Mic, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentChatClient, AgentChatClientOptions } from "@/lib/agent-chat/agent-chat-client";
import { type AgentChatMessage, useAgentChat } from "@/lib/agent-chat/use-agent-chat";
import { useAgentConversations } from "@/lib/agent-chat/use-agent-conversations";
import type {
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
} from "@/lib/agent-chat/agent-conversations-api";
import type { AgentChatEntityRef, AgentConversationDto, AgentScreenContext } from "@/lib/api/contracts";
import { useSessionState } from "@/lib/session/use-session";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { requestAgendaRefresh } from "./agenda-refresh";
import styles from "./mockup.module.css";
import { BraidAssistantIcon } from "./navigation-icons";

const SUGGESTIONS = ["O que tenho na agenda hoje?", "Criar uma tarefa", "Anotar uma ideia"];

/** O chat e aberto a partir da agenda; o agente decide se isso importa para o pedido. */
const AGENDA_CONTEXT: AgentScreenContext = { screen: "agenda" };

const CHANGE_LABELS: Record<AgentChatEntityRef["kind"], Record<AgentChatEntityRef["change"], string>> = {
  event: { created: "Evento criado", updated: "Evento alterado", deleted: "Evento apagado" },
  task: { created: "Tarefa criada", updated: "Tarefa alterada", deleted: "Tarefa apagada" },
  note: { created: "Nota criada", updated: "Nota alterada", deleted: "Nota apagada" },
};

export function entityChipText(entity: AgentChatEntityRef): string {
  const change = CHANGE_LABELS[entity.kind][entity.change];
  return entity.label ? `${change} · ${entity.label}` : change;
}

type ChatClientFactory = (options: AgentChatClientOptions) => Pick<AgentChatClient, "send" | "cancel" | "close">;

/**
 * A conversa da agenda. Fica no `MobileNavigation`, que nunca desmonta: fechar
 * o painel ou trocar de modo nao pode apagar a conversa nem derrubar a
 * resposta em andamento. Fora do modo live (o mockup) nao conecta.
 */
interface AgendaChatOptions {
  live: boolean;
  createClient?: ChatClientFactory;
  /** Injetaveis pelos testes, como `createClient`: nenhum deles toca a rede la. */
  loadConversations?: typeof fetchConversations;
  removeConversation?: typeof deleteConversation;
  loadMessages?: typeof fetchConversationMessages;
}

export function useAgendaChat({
  live,
  createClient,
  loadConversations,
  removeConversation,
  loadMessages,
}: AgendaChatOptions) {
  const { user, ready } = useSessionState();
  const userId = live ? user?.userId : undefined;
  const chat = useAgentChat({
    userId,
    context: AGENDA_CONTEXT,
    onEntitiesChanged: requestAgendaRefresh,
    createClient,
    loadMessages,
  });
  const conversations = useAgentConversations({
    userId,
    load: loadConversations,
    remove: removeConversation,
  });

  // A conversa so ganha id quando o primeiro turno e gravado: e o momento em
  // que ela passa a existir para a lista.
  const { refresh } = conversations;
  const openedId = chat.conversationId;
  useEffect(() => {
    if (openedId) void refresh();
  }, [openedId, refresh]);

  return { chat, conversations, signedOut: ready && !user };
}

/** O nome de uma conversa: o titulo, se alguem deu um; senao o primeiro pedido. */
export function conversationLabel(conversation: AgentConversationDto): string {
  return conversation.title ?? conversation.preview ?? "Conversa";
}

/**
 * O modo "Chat com IA" do painel "Buscar e criar", ligado ao agente de verdade.
 * O texto das respostas e texto puro: nada do que o modelo escreve vira HTML.
 */
export function AgentChatPanel({ chat, conversations, signedOut }: ReturnType<typeof useAgendaChat>) {
  const [prompt, setPrompt] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { supported: voiceSupported, listening, interim, error: voiceError, start, stop } = useSpeechRecognition({
    onFinalTranscript: (transcript) => {
      if (!chat.send(transcript)) setPrompt(transcript);
    },
  });

  const lastMessageId = chat.messages.at(-1)?.id;
  const progressLabel = chat.pending?.label;
  // Rola ate o fim a cada mensagem nova ou passo de progresso.
  useEffect(() => {
    void lastMessageId;
    void progressLabel;
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastMessageId, progressLabel]);

  const current = conversations.conversations.find((item) => item.id === chat.conversationId);

  return (
    <div className={styles.assistantPanel}>
      {!signedOut && (
        <>
          <div className={styles.chatHeader}>
            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              aria-expanded={listOpen}
              aria-label="Suas conversas"
            >
              <MessagesSquare aria-hidden />
              <span>{current ? conversationLabel(current) : "Nova conversa"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                chat.startNewConversation();
                setListOpen(false);
              }}
              disabled={Boolean(chat.pending)}
              aria-label="Nova conversa"
            >
              <Plus aria-hidden />
            </button>
          </div>
          {listOpen && (
            <ul className={styles.conversationList} aria-label="Conversas">
              {conversations.conversations.length === 0 ? (
                <li data-empty="true">Nenhuma conversa ainda.</li>
              ) : (
                conversations.conversations.map((conversation) => (
                  <li key={conversation.id} data-current={conversation.id === chat.conversationId}>
                    <button
                      type="button"
                      onClick={() => {
                        void chat.openConversation(conversation.id);
                        setListOpen(false);
                      }}
                      disabled={Boolean(chat.pending)}
                    >
                      {conversationLabel(conversation)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void conversations.forget(conversation.id);
                        if (conversation.id === chat.conversationId) chat.startNewConversation();
                      }}
                      aria-label={`Apagar conversa: ${conversationLabel(conversation)}`}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
      {chat.loading ? (
        <p className={styles.chatStatus} role="status">
          Carregando a conversa…
        </p>
      ) : chat.messages.length === 0 ? (
        <>
          <div className={styles.assistantWelcome}>
            <BraidAssistantIcon />
            <h3>O que vamos fazer?</h3>
            <p>
              {signedOut
                ? "Entre na sua conta para conversar com a IA."
                : "Pergunte sobre o seu dia ou peça para criar eventos, tarefas e notas."}
            </p>
          </div>
          {!signedOut && (
            <div className={styles.promptSuggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <ol className={styles.chatLog} role="log" aria-live="polite" aria-label="Conversa com a IA">
          {chat.messages.map((message) => (
            <ChatBubble key={message.id} message={message} onRetry={chat.pending ? undefined : chat.retry} />
          ))}
        </ol>
      )}
      {chat.pending && (
        <p className={styles.chatStatus} role="status">
          {chat.pending.label ?? "Pensando"}…
        </p>
      )}
      <div ref={endRef} />
      {voiceError && <p className={styles.hubComposerHint}>{voiceError}</p>}
      <form
        className={styles.hubComposer}
        onSubmit={(event) => {
          event.preventDefault();
          if (chat.send(prompt)) setPrompt("");
        }}
      >
        <input
          aria-label="Mensagem para a IA"
          value={listening ? interim : prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={listening ? "Ouvindo…" : "Pergunte ou peça para criar…"}
          maxLength={4000}
          disabled={!chat.ready || listening}
        />
        {voiceSupported && !chat.pending && (
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={!chat.ready}
            aria-pressed={listening}
            aria-label={listening ? "Parar gravação" : "Falar com a IA"}
            data-listening={listening}
          >
            {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
          </button>
        )}
        {chat.pending ? (
          <button type="button" onClick={chat.cancel} disabled={chat.pending.cancelling} aria-label="Parar resposta">
            <Square aria-hidden />
          </button>
        ) : null}
      </form>
    </div>
  );
}

function ChatBubble({ message, onRetry }: { message: AgentChatMessage; onRetry?: (id: string) => void }) {
  if (message.role === "user") {
    return (
      <li className={styles.chatBubble} data-role="user">
        <p>{message.text}</p>
      </li>
    );
  }

  if (message.role === "assistant") {
    return (
      <li className={styles.chatBubble} data-role="assistant">
        <p>{message.text}</p>
        {message.entities.length > 0 && (
          <ul className={styles.chatEntities} aria-label="Registros desta resposta">
            {message.entities.map((entity) => (
              <li key={`${entity.change}:${entity.id}`} data-change={entity.change}>
                {entityChipText(entity)}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li className={styles.chatBubble} data-role="error">
      <p>{message.text}</p>
      {onRetry && message.retryText && (
        <button type="button" onClick={() => onRetry(message.id)}>
          <RotateCcw aria-hidden />
          Tentar de novo
        </button>
      )}
    </li>
  );
}
