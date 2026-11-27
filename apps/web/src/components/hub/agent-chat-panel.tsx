"use client";

import {
  ArrowUp,
  Bell,
  CalendarDays,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { formatTime } from "@repo/timeline";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import field from "@/components/detail/entity-ai-edit-bar.module.css";
import { HermesComposer } from "@/components/ui/hermes-composer";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { isModelCommand } from "@/lib/entity-edit/entity-edit-target";
import { briefDate } from "@/lib/dates/day-labels";
import { modelFooter } from "@/lib/agent-chat/model-selection";
import { pendingStepLabel } from "@/lib/agent-chat/pending-step";
import { type AgentChatMessage, useAgentChat } from "@/lib/agent-chat/use-agent-chat";
import { isSuccessAgentStatus } from "@repo/contracts";
import type { ModelOptionsDto, RequestScreenContext } from "@repo/contracts";
import type { AgentChatEntityRef } from "@/lib/agent-chat/use-agent-chat";
import { useSessionState } from "@/lib/session/use-session";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { requestAgendaRefresh } from "@/components/agenda/agenda-refresh";
import type { FreeWindow } from "./hub-open";
import { AgentTrace } from "./agent-trace";
import { ChatAnswer } from "./chat-answer";
import { ChatActions, ChatReply } from "./chat-reply";
import { ModelFooter, useModelPicker } from "./model-picker";
import { CHANGE_LABELS, EntityRows } from "./entity-rows";
import { ProcessAnswer } from "./process-answer";
import { HUB_COMMANDS, type HubCommand, type HubCommandId, isStopSpeech, parseCommand } from "./hub-commands";
import styles from "@/components/shell/shell.module.css";

/** O nome no topo do chat enquanto as mensagens vão a um agente de modo (`/hermes`, `/modelo`). */
const AGENT_NAMES = { hermes: "Hermes", model: "Modelo" } as const;

/** Quanto a voz precisa ficar parada para o que foi dito seguir para a IA. */
const SILENCE_SEND_MS = 1800;

/** O chat e aberto a partir da agenda; o agente decide se isso importa para o pedido. */
const AGENDA_CONTEXT: RequestScreenContext = { screen: "agenda" };

export function entityChipText(entity: AgentChatEntityRef): string {
  const change = CHANGE_LABELS[entity.kind][entity.change];
  return entity.label ? `${change} · ${entity.label}` : change;
}

const ENTITY_ROUTES: Record<AgentChatEntityRef["kind"], string> = { task: "tarefas", note: "notas" };

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
  /** Injetavel pelos testes: `pollMs` encurta o intervalo de consulta do pedido. */
  pollMs?: number;
}

export function useAgendaChat({ live, pollMs }: AgendaChatOptions) {
  const { user, ready } = useSessionState();
  const userId = live ? user?.userId : undefined;
  const chat = useAgentChat({
    userId,
    context: AGENDA_CONTEXT,
    onEntitiesChanged: requestAgendaRefresh,
    processPollMs: pollMs,
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
  /**
   * O chat acabou de ser aberto pela pessoa (o botão da barra, o campo do
   * cabeçalho, uma janela livre): já começa ouvindo, sem esperar o toque na onda.
   */
  listenOnOpen?: boolean;
}

const COMMAND_ICONS: Record<HubCommandId, typeof CalendarDays> = {
  task: CalendarDays,
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
  listenOnOpen = false,
}: AgentChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  // A vista da conversa: so ela, ou com o processo da IA (em paralelo quando ha largura; no lugar dela quando nao).
  const [pane, setPane] = useState<"chat" | "process">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // O seletor de modelo fica sempre no pé do campo: no assistente da agenda e no modo modelo o pedido roda com a
  // escolha. Só o Hermes responde com o modelo dele, então no modo dele o seletor sai. A folha da escolha abre por
  // cima da tela.
  const picker = useModelPicker(chat.model, { hidden: chat.agentMode === "hermes", returnFocus: inputRef });
  // Ao abrir o chat, volta a acompanhar os pedidos que ainda rodam (o hook não repete o que já mostra).
  useEffect(() => {
    void chat.recover();
  }, [chat.recover]);
  const commandsId = useId();
  // Aberto pela pessoa, o chat ja monta ouvindo (se da para falar com a IA agora).
  const listensOnOpen = listenOnOpen && chat.ready && !chat.pending;
  const { supported: voiceSupported, listening, heard, error: voiceError, start, stop, cancel } = useSpeechRecognition({
    // Parar a onda com um toque transcreve para o campo; quem envia e a pessoa.
    onFinalTranscript: (transcript) => setPrompt((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
    // Se a voz parar sozinha, o que foi dito segue para a IA.
    silenceMs: SILENCE_SEND_MS,
    onSilenceTranscript: (transcript) => sendSpokenRef.current(transcript),
    autoStart: listensOnOpen,
  });
  const sendSpokenRef = useRef<(transcript: string) => void>(() => {});
  // O microfone que abriu sozinho nao reclama: silencio ou permissao negada so
  // viram aviso quando foi a pessoa quem tocou na onda.
  const [quietVoice, setQuietVoice] = useState(listensOnOpen);
  // A sessão pode chegar depois de o painel abrir: o `autoStart` do hook só vale
  // no primeiro render, então a primeira vez que já dá para ouvir liga o
  // microfone (uma vez por abertura; parar na onda não o religa).
  const autoListenRef = useRef(false);
  // A primeira tecla é da pessoa: a partir dela o microfone não liga mais
  // sozinho (nem quando a sessão chega depois de o painel abrir).
  const userTypedRef = useRef(false);
  useEffect(() => {
    if (autoListenRef.current) return;
    if (userTypedRef.current) {
      autoListenRef.current = true;
      return;
    }
    if (!listenOnOpen || !chat.ready || chat.pending) return;
    autoListenRef.current = true;
    setQuietVoice(true);
    start();
  }, [listenOnOpen, chat.ready, chat.pending, start]);

  const lastMessage = chat.messages.at(-1);
  const lastMessageId = lastMessage?.id;
  const progressLabel = chat.pending ? pendingStepLabel(chat.messages, chat.pending) : undefined;
  // A última fala do assistente, quando é ela que fecha a conversa: é dela que se copia o texto.
  const lastAnswer = lastMessage?.role === "assistant" ? lastMessage.text
    : lastMessage?.role === "process" && lastMessage.request && isSuccessAgentStatus(lastMessage.request.status) ? lastMessage.request.message ?? ""
    : "";
  // O nome sobre cada fala é o de quem responde agora, o mesmo do topo do chat.
  const agentName = chat.agentMode ? AGENT_NAMES[chat.agentMode] : "Assistente";
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
  // O que esta no campo: o texto digitado e, enquanto o microfone esta aberto, o que ja foi ouvido.
  const draft = (listening && heard ? `${prompt ? `${prompt} ` : ""}${heard}` : prompt).slice(0, 4000);
  const hasText = Boolean(draft.trim());
  const lastRole = chat.messages.at(-1)?.role;
  const state: HermesState = listening ? "listening" : chat.pending ? "thinking" : lastRole === "error" ? "error" : "idle";
  const statusText = listening ? "Ouvindo…"
    // Enquanto o pedido roda, a linha diz o passo em que o agente está (a conversa não mostra o andamento).
    : chat.pending ? `${pendingStepLabel(chat.messages, chat.pending)}…`
    : lastRole === "error" ? "Não deu certo"
    : "Esperando o seu pedido";
  const range = freeWindow ? windowRange(freeWindow) : null;
  // Os comandos da barra "/" moram na conversa: enquanto ha comandos a escolher, e ela que aparece.
  const shownPane = view === "conversation" && commandMatches.length === 0 ? pane : "chat";
  const traceSteps = chat.traces.at(-1)?.trace?.entries.length ?? 0;

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
    // `/model` abre a folha da escolha do modelo (o campo não mostra o modelo); não vira mensagem.
    if (picker.choice && isModelCommand(draft)) {
      if (listening) cancel();
      updatePrompt("");
      picker.show();
      return;
    }
    if (chat.send(freeWindow ? requestWithWindow(freeWindow, draft) : draft)) {
      // Enviar o que foi dito fecha o microfone: o pedido ja foi.
      if (listening) cancel();
      updatePrompt("");
      onClearFreeWindow?.();
    }
  }

  // Sem texto que vire comando e sem a IA ocupada, a fala vai direto; senao, cai no campo.
  // Depois da resposta o microfone fica desligado: quem quer falar de novo toca na onda.
  sendSpokenRef.current = (transcript) => {
    // "para", "chega": a fala que manda parar nao vira pedido.
    if (isStopSpeech(transcript)) return;
    const text = (prompt ? `${prompt} ${transcript}` : transcript).slice(0, 4000);
    if (!parseCommand(text) && chat.send(freeWindow ? requestWithWindow(freeWindow, text) : text)) {
      updatePrompt("");
      onClearFreeWindow?.();
      return;
    }
    updatePrompt(text);
  };

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // A primeira tecla é da pessoa: o microfone para e o que já foi ouvido vira
    // texto, para a tecla chegar ao campo em vez de se perder com a fala.
    userTypedRef.current = true;
    if (listening) {
      updatePrompt((heard ? `${prompt ? `${prompt} ` : ""}${heard}` : prompt).slice(0, 4000));
      cancel();
    }
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

  const controls = (
    <>
      {voiceSupported ? (
        <button
          type="button"
          className={field.voice}
          onClick={listening ? stop : () => { setQuietVoice(false); start(); }}
          disabled={!chat.ready || Boolean(chat.pending)}
          aria-pressed={listening}
          aria-label={listening ? "Parar de transcrever" : "Transcrever o que eu disser"}
        >
          <HermesGlyph />
        </button>
      ) : null}
      {chat.pending?.requestId ? (
        // Com o pedido aceito pela API, a seta vira o quadrado que o cancela: a conversa não tem mais a caixa de processo.
        <button type="button" className={field.send} data-stop onClick={chat.cancel} aria-label="Cancelar pedido">
          <Square aria-hidden fill="currentColor" />
        </button>
      ) : (
        <button type="submit" className={field.send} aria-label={chat.pending ? "Aguardando a resposta" : "Enviar mensagem"} disabled={!chat.ready || Boolean(chat.pending) || (!hasText && !highlighted)}>
          <ArrowUp aria-hidden />
        </button>
      )}
    </>
  );

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
          <span className={styles.chatLive}>{chat.agentMode ? AGENT_NAMES[chat.agentMode] : "Assistente"}</span>
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

      {view === "conversation" ? (
        <fieldset className={styles.chatPanes} aria-label="Vista do chat">
          <button type="button" aria-pressed={pane === "chat"} onClick={() => setPane("chat")}>Conversa</button>
          <button type="button" aria-pressed={pane === "process"} onClick={() => setPane("process")}>
            Processo
            {traceSteps > 0 ? <span className={styles.chatPaneCount} data-running={Boolean(chat.pending)}>{traceSteps}</span> : null}
          </button>
        </fieldset>
      ) : null}

      <div className={styles.chatSplit} data-pane={shownPane}>
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
                  onChoose={message.id === lastMessageId && chat.ready && !chat.pending ? chat.send : undefined}
                  onRetry={chat.pending ? undefined : chat.retry}
                  entityHref={entityHref}
                  onOpenEntity={onClose}
                  modelOptions={chat.model.options}
                  name={agentName}
                />
              ))}
              {!chat.pending && lastAnswer.trim() ? (
                <ChatActions text={lastAnswer} steps={traceSteps} onOpenProcess={() => setPane("process")} />
              ) : null}
            </ol>
            <div ref={endRef} />
          </>
        )}
      </div>
      {shownPane === "process" ? (
        <div className={styles.chatProcess}>
          <AgentTrace traces={chat.traces} />
        </div>
      ) : null}
      </div>

      <div className={styles.chatField}>
        {voiceError && !quietVoice && <p className={styles.hubComposerHint}>{voiceError}</p>}
        <p className={field.status} data-state={state} role="status" aria-live="polite">
          <HermesMark state={state} plain />
          <span className={chat.pending && !listening ? styles.chatStep : undefined}>{statusText}</span>
        </p>
        <HermesComposer
          model={picker}
          onSubmit={submit}
          controls={controls}
          context={freeWindow && range ? (
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
        >
          <textarea
            ref={inputRef}
            className={field.input}
            rows={1}
            aria-label="Mensagem para a IA"
            aria-controls={commandMatches.length > 0 ? commandsId : undefined}
            aria-activedescendant={highlighted ? `${commandsId}-${highlighted.id}` : undefined}
            value={draft}
            onChange={(event) => {
              // Quem digita assume o campo: a primeira tecla desliga o microfone
              // e o que ja estava escrito (ouvido ou nao) fica como texto.
              userTypedRef.current = true;
              if (listening) cancel();
              updatePrompt(event.target.value.slice(0, 4000));
            }}
            onKeyDown={onKeyDown}
            placeholder={freeWindow ? "Diga o que quer fazer nesse tempo" : "Diga ou escreva o que precisa"}
            maxLength={4000}
            autoComplete="off"
            enterKeyHint="send"
            disabled={!chat.ready}
          />
        </HermesComposer>
      </div>
    </div>
  );
}

interface ChatBubbleProps {
  message: AgentChatMessage;
  onRetry?: (id: string) => void;
  /** Envia a alternativa escolhida numa resposta; ausente quando a resposta ja nao espera escolha. */
  onChoose?: (choice: string) => void;
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
  /** O que o servidor oferece ao modo modelo: dá o nome do modelo no rodapé da resposta. */
  modelOptions?: ModelOptionsDto | null;
  /** Quem responde ("Assistente", "Hermes", "Modelo"): vai sobre cada fala, ao lado do robô. */
  name: string;
}

/**
 * Uma fala da conversa (canvas "Chat com o Hermes — conversa limpa", opção B). Os passos do Hermes e do modelo
 * (`hermes-steps`) e o andamento de um pedido por passos não entram aqui: ficam na aba "Processo".
 */
function ChatBubble({ message, onRetry, onChoose, entityHref, onOpenEntity, modelOptions = null, name }: ChatBubbleProps) {
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
        <ChatReply name={name}>
          <ChatAnswer text={message.text} onChoose={onChoose} />
        </ChatReply>
        <EntityRows entities={message.entities} entityHref={entityHref} onOpenEntity={onOpenEntity} />
        {message.model ? <ModelFooter text={modelFooter(modelOptions, message.model)} /> : null}
      </li>
    );
  }

  if (message.role === "process") {
    return <ProcessAnswer request={message.request} name={name} entityHref={entityHref} onOpenEntity={onOpenEntity} />;
  }

  if (message.role === "hermes-steps") return null;

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
