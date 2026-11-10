"use client";

import {
  ArrowUp,
  Bell,
  CalendarDays,
  FileText,
  ListChecks,
  Maximize2,
  Mic,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AiAutomationApi } from "@/lib/ai-automation/ai-automation";
import type { AiProcessApi } from "@/lib/ai-process/ai-process";
import { type AgentChatMessage, useAgentChat } from "@/lib/agent-chat/use-agent-chat";
import type { AgentChatEntityRef, AgentScreenContext } from "@/lib/api/contracts";
import { useSessionState } from "@/lib/session/use-session";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { requestAgendaRefresh } from "@/components/agenda/agenda-refresh";
import { HermesSteps } from "./hermes-steps";
import { CHANGE_LABELS, EntityRows } from "./entity-rows";
import { ProcessBox } from "./process-box";
import { HUB_COMMANDS, type HubCommand, type HubCommandId, parseCommand } from "./hub-commands";
import styles from "@/components/shell/shell.module.css";

/** O chat e aberto a partir da agenda; o agente decide se isso importa para o pedido. */
const AGENDA_CONTEXT: AgentScreenContext = { screen: "agenda" };

export function entityChipText(entity: AgentChatEntityRef): string {
  const change = CHANGE_LABELS[entity.kind][entity.change];
  return entity.label ? `${change} · ${entity.label}` : change;
}

const ENTITY_ROUTES: Record<AgentChatEntityRef["kind"], string> = { event: "eventos", task: "tarefas", note: "notas" };

/** A pagina do registro que a resposta tocou; o que foi apagado nao tem para onde ir. */
export function agentEntityHref(userId: string, entity: AgentChatEntityRef): string | undefined {
  if (entity.change === "deleted") return undefined;
  return `/${userId}/${ENTITY_ROUTES[entity.kind]}/${encodeURIComponent(entity.id)}`;
}

/** Os atalhos da caixa de mensagem: escrevem o comando no campo, como digitar "/". */
const COMPOSER_COMMANDS = HUB_COMMANDS.filter((command) => ["task", "event", "note"].includes(command.id));

/**
 * A conversa da agenda. Fica no `MobileNavigation`, que nunca desmonta: fechar
 * o painel ou trocar de modo nao pode apagar a conversa nem derrubar a
 * resposta em andamento. Fora do modo live (o mockup) nao conecta.
 */
interface AgendaChatOptions {
  live: boolean;
  /** Injetaveis pelos testes: nenhum deles toca a rede la. */
  processApi?: AiProcessApi;
  automationApi?: AiAutomationApi;
}

export function useAgendaChat({ live, processApi, automationApi }: AgendaChatOptions) {
  const { user, ready } = useSessionState();
  const userId = live ? user?.userId : undefined;
  const chat = useAgentChat({
    userId,
    context: AGENDA_CONTEXT,
    onEntitiesChanged: requestAgendaRefresh,
    processApi,
    automationApi,
  });
  return { chat, signedOut: ready && !user };
}

interface AgentChatPanelProps extends ReturnType<typeof useAgendaChat> {
  /** Tela inteira em vez do painel; quem decide o tamanho e o `MobileNavigation`. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Um comando da barra "/" (`/tarefa`, `/buscar`…) com o texto que veio depois dele. */
  onCommand?: (command: HubCommandId, argument: string) => void;
  /** Fecha o painel; tambem e chamado ao abrir um registro da resposta. */
  onClose?: () => void;
  /** Para onde leva cada registro da resposta; sem ela (o mockup), os registros sao so texto. */
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
}

const COMMAND_ICONS: Record<HubCommandId, typeof ListChecks> = {
  task: ListChecks,
  event: CalendarDays,
  note: FileText,
  search: Search,
  notifications: Bell,
  settings: Settings,
};

/**
 * O "Chat com IA" do painel "Buscar e criar", ligado ao agente de verdade. Tem
 * duas vistas: o inicio (marca, pergunta e campo) e a conversa. Criar e pesquisar saem do proprio campo, pela barra "/".
 * O texto das respostas e texto puro: nada do que o modelo escreve vira HTML.
 */
export function AgentChatPanel({
  chat,
  signedOut,
  expanded = false,
  onToggleExpanded,
  onCommand,
  onClose,
  entityHref,
}: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const view = chat.messages.length > 0 ? "conversation" : "home";
  const command = onCommand && !listening ? parseCommand(prompt) : null;
  const commandMatches = command?.matches ?? [];
  const highlighted = commandMatches[Math.min(activeCommand, commandMatches.length - 1)];
  // Os atalhos so aparecem na conversa; no inicio as pilulas de criar ja fazem esse papel.
  const showShortcuts = Boolean(onCommand) && view === "conversation";
  // Com os atalhos, a voz e o enviar ficam lado a lado; numa linha so, um ou outro, para o campo caber.
  const hasText = Boolean(prompt.trim());
  const showMic = voiceSupported && (showShortcuts || !hasText);
  const showSend = showShortcuts || hasText || !voiceSupported;

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

  const closeButton = onClose ? (
    <button type="button" className={styles.chatIconButton} data-reveal={view === "home"} onClick={onClose} aria-label="Fechar o chat">
      <X aria-hidden />
    </button>
  ) : null;

  return (
    <div className={styles.assistantPanel} data-chat-view={view}>
      <div className={styles.chatHeader}>
        {view === "conversation" && (
          <button
            type="button"
            className={styles.chatIconButton}
            onClick={chat.startNewConversation}
            disabled={Boolean(chat.pending)}
            aria-label="Nova conversa"
          >
            <Plus aria-hidden />
          </button>
        )}
        {view === "conversation" ? (
          <div className={styles.chatTitle}>
            <span className={styles.chatLive} data-busy={Boolean(chat.pending)}>
              {chat.hermesMode ? "Hermes" : "Assistente"}
            </span>
            <h2>Conversa</h2>
          </div>
        ) : (
          <span className={styles.chatHeaderSpacer} />
        )}
        {expandButton}
        {closeButton}
      </div>

      <div className={styles.chatBody}>
        {commandMatches.length > 0 ? (
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
            <h2>O que vamos fazer?</h2>
            {signedOut && <p>Entre na sua conta para conversar com a IA.</p>}
            {onCommand && (
              <fieldset className={styles.createActions} aria-label="Criar, pesquisar e ajustar">
                {HUB_COMMANDS.map((item) => {
                  const Icon = COMMAND_ICONS[item.id];
                  return (
                    <button type="button" key={item.id} onClick={() => onCommand(item.id, "")}>
                      <Icon aria-hidden />
                      {item.label}
                    </button>
                  );
                })}
              </fieldset>
            )}
          </div>
        ) : (
          <>
            <ol className={styles.chatLog} role="log" aria-live="polite" aria-label="Conversa com a IA">
              {chat.messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onRetry={chat.pending ? undefined : chat.retry}
                  entityHref={entityHref}
                  onOpenEntity={onClose}
                />
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

      {(
        <>
          {voiceError && <p className={styles.hubComposerHint}>{voiceError}</p>}
          <form
            className={styles.chatComposer}
            data-shortcuts={showShortcuts}
            onSubmit={(event) => {
              event.preventDefault();
              if (highlighted) runCommand(highlighted);
              else if (chat.send(prompt)) updatePrompt("");
            }}
          >
            <input
              ref={inputRef}
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
            <div className={styles.chatComposerRow}>
              {showShortcuts && (
                <fieldset className={styles.chatComposerCommands} aria-label="Comandos rápidos">
                  {COMPOSER_COMMANDS.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      title={item.label}
                      disabled={!chat.ready || listening}
                      onClick={() => {
                        updatePrompt(`/${item.slug} `);
                        inputRef.current?.focus();
                      }}
                    >
                      /{item.slug}
                    </button>
                  ))}
                </fieldset>
              )}
              <div className={styles.chatComposerActions}>
                {chat.pending ? (
                  <button type="button" disabled aria-label="Aguardando a resposta" data-send="true">
                    <ArrowUp aria-hidden />
                  </button>
                ) : listening ? (
                  <button type="button" onClick={stop} aria-pressed aria-label="Parar gravação" data-listening="true">
                    <Square aria-hidden />
                  </button>
                ) : (
                  <>
                    {showMic && (
                      <button type="button" onClick={start} disabled={!chat.ready} aria-pressed={false} aria-label="Falar com a IA">
                        <Mic aria-hidden />
                      </button>
                    )}
                    {showSend && (
                      <button type="submit" aria-label="Enviar mensagem" data-send="true" disabled={!chat.ready || !hasText}>
                        <ArrowUp aria-hidden />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

interface ChatBubbleProps {
  message: AgentChatMessage;
  onRetry?: (id: string) => void;
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
}

/** Linhas em branco separam parágrafos; quebras simples ficam dentro do parágrafo. */
function splitParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [text];
}

function ChatBubble({ message, onRetry, entityHref, onOpenEntity }: ChatBubbleProps) {
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
        <div className={styles.chatProse}>
          {splitParagraphs(message.text).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <EntityRows entities={message.entities} entityHref={entityHref} onOpenEntity={onOpenEntity} />
      </li>
    );
  }

  if (message.role === "process") {
    return (
      <li className={styles.chatBubble} data-role="process">
        <ProcessBox process={message.process} entityHref={entityHref} onOpenEntity={onOpenEntity} />
      </li>
    );
  }

  if (message.role === "hermes-steps") {
    return (
      <li className={styles.chatBubble} data-role="hermes-steps">
        <HermesSteps steps={message.steps} running={message.running} />
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
