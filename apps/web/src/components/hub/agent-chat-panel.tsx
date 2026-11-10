"use client";

import {
  ArrowUp,
  Bell,
  CalendarDays,
  FileText,
  ListChecks,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { formatTime } from "@repo/timeline";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import field from "@/components/detail/entity-ai-edit-bar.module.css";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { briefDate } from "@/lib/dates/day-labels";
import type { AiAutomationApi } from "@/lib/ai-automation/ai-automation";
import type { AiProcessApi } from "@/lib/ai-process/ai-process";
import { type AgentChatMessage, useAgentChat } from "@/lib/agent-chat/use-agent-chat";
import type { AgentChatEntityRef, AgentScreenContext } from "@/lib/api/contracts";
import { useSessionState } from "@/lib/session/use-session";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { requestAgendaRefresh } from "@/components/agenda/agenda-refresh";
import type { FreeWindow } from "./hub-events";
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

/** "10:30" e "12:30" (ou "24:00" no fim do dia) de uma janela livre. */
function windowRange(freeWindow: FreeWindow): { start: string; end: string } {
  return {
    start: formatTime(new Date(freeWindow.startMs).toISOString()),
    end: freeWindow.endsAtMidnight ? "24:00" : formatTime(new Date(freeWindow.endMs).toISOString()),
  };
}

/** "2 h 30 min": quanto dura a janela, por extenso, para o pedido. */
function windowDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

/** O pedido com a janela anexada: o agente só recebe texto, então a janela vai escrita na frente. */
export function requestWithWindow(freeWindow: FreeWindow, text: string): string {
  const { start, end } = windowRange(freeWindow);
  return `Sobre a janela livre de ${briefDate(freeWindow.dayKey)}, das ${start} às ${end} (${windowDuration(freeWindow.minutes)}): ${text.trim()}`;
}

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
  /** A janela livre da agenda que abriu o chat: vai anexada ao campo e ao proximo pedido. */
  freeWindow?: FreeWindow | null;
  onClearFreeWindow?: () => void;
  /** O dia de hoje, para dizer "hoje" na janela anexada. */
  todayKey?: string;
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
  freeWindow = null,
  onClearFreeWindow,
  todayKey,
}: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commandsId = useId();
  const { supported: voiceSupported, listening, interim, error: voiceError, start, stop } = useSpeechRecognition({
    // A onda transcreve para o campo; quem envia e a pessoa.
    onFinalTranscript: (transcript) => setPrompt((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
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
  const hasText = Boolean(prompt.trim());
  const lastRole = chat.messages.at(-1)?.role;
  const state: HermesState = listening ? "listening" : chat.pending ? "thinking" : lastRole === "error" ? "error" : "idle";
  const statusText = listening ? "Ouvindo…"
    : chat.pending ? `${chat.pending.label ?? "Pensando"}…`
    : lastRole === "error" ? "Não deu certo"
    : "Esperando o seu pedido";
  const range = freeWindow ? windowRange(freeWindow) : null;

  function updatePrompt(value: string) {
    setPrompt(value);
    setActiveCommand(0);
  }

  function runCommand(target: HubCommand) {
    onCommand?.(target.id, command?.argument ?? "");
    updatePrompt("");
  }

  function submit() {
    if (highlighted) {
      runCommand(highlighted);
      return;
    }
    if (!hasText) return;
    if (chat.send(freeWindow ? requestWithWindow(freeWindow, prompt) : prompt)) {
      updatePrompt("");
      onClearFreeWindow?.();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
      return;
    }
    if (commandMatches.length === 0) return;
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setActiveCommand((index) => (Math.min(index, commandMatches.length - 1) + step + commandMatches.length) % commandMatches.length);
  }

  return (
    <div className={styles.assistantPanel} data-chat-view={view}>
      <div className={styles.chatHeader}>
        <button
          type="button"
          className={styles.chatIconButton}
          onClick={chat.startNewConversation}
          disabled={view === "home" || Boolean(chat.pending)}
          aria-label="Nova conversa"
        >
          <Plus aria-hidden />
        </button>
        <div className={styles.chatTitle}>
          <span className={styles.chatLive}>{chat.hermesMode ? "Hermes" : "Assistente"}</span>
          {view === "conversation" ? <h2>Conversa</h2> : <p>Nova conversa</p>}
        </div>
        {onToggleExpanded ? (
          <button type="button" className={styles.chatIconButton} data-chat-control onClick={onToggleExpanded} aria-label={expanded ? "Recolher para o painel" : "Expandir para tela inteira"}>
            {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className={styles.chatIconButton} data-chat-control onClick={onClose} aria-label="Fechar o chat">
            <X aria-hidden />
          </button>
        ) : null}
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
            <h2>{range ? `O que vamos fazer das ${range.start} às ${range.end}?` : "O que vamos fazer?"}</h2>
            {signedOut && <p>Entre na sua conta para conversar com a IA.</p>}
            {/* Com uma janela anexada a pergunta já é o convite: os atalhos de criar saem. */}
            {onCommand && !freeWindow ? (
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
            ) : null}
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
            <div ref={endRef} />
          </>
        )}
      </div>

      <div className={styles.chatField}>
        {voiceError && <p className={styles.hubComposerHint}>{voiceError}</p>}
        <p className={field.status} data-state={state} role="status" aria-live="polite">
          <HermesMark state={state} />
          <span>{statusText}</span>
        </p>
        <form
          className={field.form}
          aria-label="Pedido ao Hermes"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {freeWindow && range ? (
            <div className={`${field.context} ${styles.chatWindow}`}>
              <span className={field.contextIcon} aria-hidden><Plus /></span>
              <span className={field.contextText}>
                <span>Janela livre · {todayKey && freeWindow.dayKey === todayKey ? "hoje" : briefDate(freeWindow.dayKey)}</span>
                <span>{range.start} — {range.end}</span>
              </span>
              <span className={styles.chatWindowDuration} aria-hidden>
                {freeWindow.minutes >= 60 ? <>{Math.floor(freeWindow.minutes / 60)}<small>h</small></> : null}
                {freeWindow.minutes % 60 > 0 ? <>{freeWindow.minutes % 60}<small>min</small></> : null}
              </span>
              <button type="button" className={styles.chatIconButton} onClick={onClearFreeWindow} aria-label="Tirar a janela livre do pedido"><X aria-hidden /></button>
            </div>
          ) : null}
          <div className={field.row}>
            <textarea
              ref={inputRef}
              className={field.input}
              rows={1}
              aria-label="Mensagem para a IA"
              aria-controls={commandMatches.length > 0 ? commandsId : undefined}
              aria-activedescendant={highlighted ? `${commandsId}-${highlighted.id}` : undefined}
              value={listening && interim ? `${prompt ? `${prompt} ` : ""}${interim}` : prompt}
              onChange={(event) => updatePrompt(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={freeWindow ? "Diga o que quer fazer nesse tempo" : "Diga ou escreva o que precisa"}
              maxLength={4000}
              autoComplete="off"
              enterKeyHint="send"
              disabled={!chat.ready}
              readOnly={listening}
            />
            {voiceSupported ? (
              <button
                type="button"
                className={field.voice}
                onClick={listening ? stop : start}
                disabled={!chat.ready || Boolean(chat.pending)}
                aria-pressed={listening}
                aria-label={listening ? "Parar de transcrever" : "Transcrever o que eu disser"}
              >
                <HermesGlyph />
              </button>
            ) : null}
            <button type="submit" className={field.send} aria-label={chat.pending ? "Aguardando a resposta" : "Enviar mensagem"} disabled={!chat.ready || Boolean(chat.pending) || (!hasText && !highlighted)}>
              <ArrowUp aria-hidden />
            </button>
          </div>
        </form>
      </div>
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
