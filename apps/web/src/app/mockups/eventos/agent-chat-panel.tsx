"use client";

import {
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  Maximize2,
  MessagesSquare,
  Mic,
  Minimize2,
  NotepadText,
  Plus,
  RotateCcw,
  Search,
  Square,
  SquareCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
import { BraidMark } from "./braid-mark";
import { conversationTime, groupConversations, type HubCommand, type HubCommandId, parseCommand } from "./hub-commands";
import styles from "./mockup.module.css";

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

interface AgentChatPanelProps extends ReturnType<typeof useAgendaChat> {
  /** Tela inteira em vez do painel; quem decide o tamanho e o `MobileNavigation`. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Um comando da barra "/" (`/tarefa`, `/buscar`…) com o texto que veio depois dele. */
  onCommand?: (command: HubCommandId, argument: string) => void;
}

const COMMAND_ICONS: Record<HubCommandId, typeof SquareCheck> = {
  task: SquareCheck,
  event: CalendarDays,
  note: NotepadText,
  search: Search,
};

/**
 * O "Chat com IA" do painel "Buscar e criar", ligado ao agente de verdade. Tem
 * tres vistas: o inicio (marca, pergunta e campo), a conversa e a lista de
 * conversas. Criar e pesquisar saem do proprio campo, pela barra "/".
 * O texto das respostas e texto puro: nada do que o modelo escreve vira HTML.
 */
export function AgentChatPanel({
  chat,
  conversations,
  signedOut,
  expanded = false,
  onToggleExpanded,
  onCommand,
}: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeCommand, setActiveCommand] = useState(0);
  const [markRun, setMarkRun] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const commandsId = useId();
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

  const view = listOpen ? "list" : chat.loading || chat.messages.length > 0 ? "conversation" : "home";
  const command = onCommand && !listening ? parseCommand(prompt) : null;
  const commandMatches = command?.matches ?? [];
  const highlighted = commandMatches[Math.min(activeCommand, commandMatches.length - 1)];
  const current = conversations.conversations.find((item) => item.id === chat.conversationId);

  function updatePrompt(value: string) {
    setPrompt(value);
    setActiveCommand(0);
  }

  function runCommand(target: HubCommand) {
    onCommand?.(target.id, command?.argument ?? "");
    updatePrompt("");
  }

  const expandButton = onToggleExpanded ? (
    <button
      type="button"
      className={styles.chatIconButton}
      data-reveal={view === "home"}
      onClick={onToggleExpanded}
      aria-label={expanded ? "Recolher para o painel" : "Expandir para tela inteira"}
    >
      {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
    </button>
  ) : null;

  return (
    <div className={styles.assistantPanel} data-chat-view={view}>
      {view === "list" ? (
        <div className={styles.chatHeader}>
          <button type="button" className={styles.chatIconButton} onClick={() => setListOpen(false)} aria-label="Voltar para o chat">
            <ArrowLeft aria-hidden />
          </button>
          <h2>Conversas</h2>
          <button
            type="button"
            className={styles.chatIconButton}
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
      ) : (
        <div className={styles.chatHeader}>
          {!signedOut && (
            <button
              type="button"
              className={styles.chatIconButton}
              data-reveal={view === "home"}
              onClick={() => setListOpen(true)}
              aria-label="Todas as conversas"
            >
              <MessagesSquare aria-hidden />
            </button>
          )}
          {view === "conversation" && <h2>{current ? conversationLabel(current) : "Nova conversa"}</h2>}
          {expandButton}
        </div>
      )}

      <div className={styles.chatBody}>
        {view === "list" ? (
          <ConversationList
            {...conversations}
            currentId={chat.conversationId}
            busy={Boolean(chat.pending)}
            onOpen={(id) => {
              void chat.openConversation(id);
              setListOpen(false);
            }}
            onForget={(id) => {
              void conversations.forget(id);
              if (id === chat.conversationId) chat.startNewConversation();
            }}
          />
        ) : commandMatches.length > 0 ? (
          <ul className={styles.chatCommands} id={commandsId} aria-label="Comandos">
            {commandMatches.map((item) => {
              const Icon = COMMAND_ICONS[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    id={`${commandsId}-${item.id}`}
                    aria-current={item === highlighted ? "true" : undefined}
                    onClick={() => runCommand(item)}
                  >
                    <Icon aria-hidden />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    <code>/{item.slug}</code>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : view === "home" ? (
          <div className={styles.assistantWelcome}>
            <button type="button" className={styles.braidReplay} onClick={() => setMarkRun((run) => run + 1)} aria-label="Repetir a animação da marca">
              <BraidMark key={markRun} tail={expanded ? 194.94 : 73.61} />
            </button>
            <h2>O que vamos fazer?</h2>
            {signedOut && <p>Entre na sua conta para conversar com a IA.</p>}
          </div>
        ) : chat.loading ? (
          <p className={styles.chatStatus} role="status">
            Carregando a conversa…
          </p>
        ) : (
          <>
            <ol className={styles.chatLog} role="log" aria-live="polite" aria-label="Conversa com a IA">
              {chat.messages.map((message) => (
                <ChatBubble key={message.id} message={message} onRetry={chat.pending ? undefined : chat.retry} />
              ))}
            </ol>
            {chat.pending && (
              <p className={styles.chatStatus} role="status">
                {chat.pending.label ?? "Pensando"}…
              </p>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      {view !== "list" && (
        <>
          {voiceError && <p className={styles.hubComposerHint}>{voiceError}</p>}
          <form
            className={styles.chatComposer}
            onSubmit={(event) => {
              event.preventDefault();
              if (highlighted) runCommand(highlighted);
              else if (chat.send(prompt)) updatePrompt("");
            }}
          >
            <input
              aria-label="Mensagem para a IA"
              aria-controls={commandMatches.length > 0 ? commandsId : undefined}
              aria-activedescendant={highlighted ? `${commandsId}-${highlighted.id}` : undefined}
              value={listening ? interim : prompt}
              onChange={(event) => updatePrompt(event.target.value)}
              onKeyDown={(event) => {
                if (commandMatches.length === 0) return;
                const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                event.preventDefault();
                setActiveCommand((index) => (Math.min(index, commandMatches.length - 1) + step + commandMatches.length) % commandMatches.length);
              }}
              placeholder={listening ? "Ouvindo…" : "Pergunte ou digite / para comandos"}
              maxLength={4000}
              autoComplete="off"
              enterKeyHint="send"
              disabled={!chat.ready || listening}
            />
            {chat.pending ? (
              <button type="button" onClick={chat.cancel} disabled={chat.pending.cancelling} aria-label="Parar resposta">
                <Square aria-hidden />
              </button>
            ) : listening ? (
              <button type="button" onClick={stop} aria-pressed aria-label="Parar gravação" data-listening="true">
                <Square aria-hidden />
              </button>
            ) : prompt.trim() ? (
              <button type="submit" aria-label="Enviar mensagem" data-send="true">
                <ArrowUp aria-hidden />
              </button>
            ) : voiceSupported ? (
              <button type="button" onClick={start} disabled={!chat.ready} aria-pressed={false} aria-label="Falar com a IA">
                <Mic aria-hidden />
              </button>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}

interface ConversationListProps extends ReturnType<typeof useAgentConversations> {
  currentId?: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onForget: (id: string) => void;
}

/** A lista de conversas, por Hoje, Esta semana e Antes, como a tela "Conversas" do design. */
function ConversationList({ conversations, loading, error, refresh, currentId, busy, onOpen, onForget }: ConversationListProps) {
  if (error) {
    return (
      <div className={styles.conversationNotice} role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (conversations.length === 0) {
    return <p className={styles.conversationNotice}>{loading ? "Carregando conversas…" : "Nenhuma conversa ainda."}</p>;
  }

  return (
    <div className={styles.conversationGroups}>
      {groupConversations(conversations).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3>
            {group.label}
            <span>{group.items.length}</span>
          </h3>
          <ul className={styles.conversationList}>
            {group.items.map((conversation) => {
              const label = conversationLabel(conversation);
              const isCurrent = conversation.id === currentId;
              return (
                <li key={conversation.id} data-current={isCurrent}>
                  <button
                    type="button"
                    onClick={() => onOpen(conversation.id)}
                    disabled={busy}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-label={label}
                  >
                    <span className={styles.conversationTitle}>
                      <span>{label}</span>
                      {isCurrent && <Check aria-hidden />}
                    </span>
                    {conversation.title && conversation.preview !== conversation.title && <small>{conversation.preview}</small>}
                  </button>
                  <time dateTime={conversation.lastMessageAt}>{conversationTime(conversation.lastMessageAt)}</time>
                  <button type="button" onClick={() => onForget(conversation.id)} aria-label={`Apagar conversa: ${label}`}>
                    <Trash2 aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
