"use client";

import type { AgentEventStatus, AgentTraceDto, RequestDto } from "@repo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/authed-fetch";
import { ApiRequestError } from "@/lib/api/client-request";
import type { AgentChatEntityRef, AgentScreenContext } from "@/lib/api/contracts";
import { HermesOffError, cancelRequest, getRequest, listRequests, sendHermesMessage, startRequest } from "@/lib/api/requests";
import { parseChatCommand } from "./chat-mode-command";
import { type HermesStep, hermesStepsOf } from "./hermes-steps";
import { operationId } from "@/lib/ai-jobs/ai-jobs";

/** O rastro sem o `route`: o da rota por passos e o do Hermes falam a mesma forma. */
export type AgentTraceView = Omit<AgentTraceDto, "route">;

export type AgentChatMessage =
  | { id: string; role: "user"; text: string; failed?: boolean }
  | { id: string; role: "assistant"; text: string; entities: AgentChatEntityRef[] }
  /**
   * `messageId` é o id da mensagem que falhou (o que a API guarda como `clientMessageId`). `reuseMessageId`
   * diz se "Tentar de novo" reenvia com o mesmo id (a API devolve o pedido que já aceitou) ou abre um novo.
   */
  | { id: string; role: "error"; text: string; retryText: string; messageId: string; reuseMessageId: boolean }
  /** A caixa de processo (ADR 003): `null` ate o servidor responder o primeiro estado. Nao entra no historico. */
  | { id: string; role: "process"; request: RequestDto | null }
  /** Os passos do Hermes (ferramentas e pensamentos), ao vivo e depois do fim do turno. Nao entra no historico. */
  | { id: string; role: "hermes-steps"; steps: HermesStep[]; running: boolean };

/**
 * O rastro de um pedido, para a aba "Processo": um por pedido enviado, na ordem da conversa. `trace` fica
 * `null` ate o servidor responder o primeiro estado (ou quando ele nao manda rastro).
 */
export interface AgentChatTrace {
  /** O id da mensagem do usuario. */
  id: string;
  request: string;
  route: "steps" | "hermes";
  running: boolean;
  trace: AgentTraceView | null;
}

export interface AgentChatPending {
  id: string;
  label?: string;
  /** O pedido aceito pela API (o que o botão de cancelar cancela). Ausente até a API aceitar. */
  requestId?: string;
}

/** Por que um pedido falhou; cada codigo tem seu texto em `ERROR_TEXTS`. */
export type ChatFailureCode =
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  | "unavailable"
  | "cancelled"
  | "internal"
  | "connection_lost"
  | "connection_failed"
  | "session_expired";

interface UseAgentChatOptions {
  /** Sem usuario (sessao ainda nao respondeu, ou ninguem entrou) nada e enviado. */
  userId: string | undefined;
  context?: AgentScreenContext;
  /** Chamado quando uma resposta mexeu em registros — ou pode ter mexido. */
  onEntitiesChanged?: () => void;
  /** Intervalo entre consultas do pedido (por passos ou do Hermes); os testes o encurtam. */
  processPollMs?: number;
}

/** Quanto tempo a caixa de processo espera o servidor terminar antes de dar o pedido como perdido. */
const PROCESS_TIMEOUT_MS = 180_000;
/** Falhas seguidas ao consultar o processo antes de desistir de acompanhar. */
const PROCESS_POLL_FAILURES = 5;
const HERMES_DISABLED_TEXT = "O Hermes está desligado neste ambiente (AI_AUTOMATION).";
const HERMES_ENTER_TEXT = "Agora você está falando com o Hermes. Escreva /app para voltar ao assistente da agenda.";
const HERMES_LEAVE_TEXT = "De volta ao assistente da agenda.";

const ERROR_TEXTS: Record<ChatFailureCode, string> = {
  invalid_input: "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
  forbidden: "Você não tem permissão para acessar esses dados.",
  limit_reached: "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores.",
  conflict: "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
  unavailable: "A IA está indisponível agora. Tente de novo em instantes.",
  cancelled: "Pedido cancelado.",
  internal: "Algo deu errado. Tente de novo.",
  connection_lost:
    "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.",
  connection_failed: "Não consegui conectar ao assistente. Tente de novo.",
  session_expired: "Sua sessão acabou. Entre de novo para continuar.",
};

/** O texto que o usuário lê para um código de falha. O detalhe de agente usa o mesmo, sem outra tradução. */
export function agentFailureText(code: ChatFailureCode): string {
  return ERROR_TEXTS[code];
}

/**
 * Falhas de rede ou de sessão: reenviar a mesma mensagem (mesmo id) não abre um segundo pedido, porque a API
 * devolve o que já aceitou. As demais são do pedido; "Tentar de novo" abre um pedido novo.
 */
const RESUMABLE: ReadonlySet<ChatFailureCode> = new Set(["connection_failed", "connection_lost", "session_expired"]);

/** O pedido ainda não terminou: a API o entrega como fila, execução ou espera. */
export function isRequestOpen(request: Pick<RequestDto, "status">): boolean {
  return request.status === "queued" || request.status === "running" || request.status === "waiting";
}

/** Um pedido aberto que o chat mostra: a rota por passos ou a do Hermes. */
type ChatRouteRequest = RequestDto & { route: "steps" | "hermes" };

function isOpenChatRequest(request: RequestDto): request is ChatRouteRequest {
  return (request.route === "steps" || request.route === "hermes") && isRequestOpen(request);
}

/** Por que o envio do pedido falhou, do ponto de vista do chat. */
export function startFailureCode(error: unknown): ChatFailureCode {
  if (error instanceof ApiError && error.status === 401) return "session_expired";
  if (error instanceof ApiRequestError) {
    if (error.kind === "invalid_input") return "invalid_input";
    if (error.kind === "forbidden") return "forbidden";
    if (error.kind === "conflict") return "conflict";
    if (error.kind === "unavailable") return "unavailable";
  }
  return "connection_failed";
}

/**
 * A conversa da agenda. Cada mensagem vira um pedido na API (rota por passos) ou, com `/hermes`, vai ao Hermes
 * (ADR 004). O historico e so do que esta na tela: nada e recarregado do servidor.
 */
export function useAgentChat({
  userId,
  context,
  onEntitiesChanged,
  processPollMs = 1000,
}: UseAgentChatOptions) {
  const disposedRef = useRef(false);
  /** `/hermes` liga o modo: as mensagens seguintes vao ao Hermes ate `/app`, ou ate comecar de novo. */
  const hermesModeRef = useRef(false);
  const [hermesMode, setHermesMode] = useState(false);
  const commitHermesMode = useCallback((next: boolean) => {
    hermesModeRef.current = next;
    setHermesMode(next);
  }, []);
  /** O primeiro pedido da conversa: toda mensagem seguinte o manda como `sessionId`. */
  const sessionRef = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [pending, setPending] = useState<AgentChatPending | null>(null);
  const [traces, setTraces] = useState<AgentChatTrace[]>([]);
  const tracesRef = useRef(traces);
  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
  /** As mensagens (ids) cujo pedido o chat está acompanhando agora: a enviada e as recuperadas ao abrir. */
  const followingRef = useRef(new Set<string>());
  /** Os pedidos (ids da API) que a conversa já mostra ou enviou: a lista ao abrir não os repete. */
  const knownRequestsRef = useRef(new Set<string>());
  /** Enquanto a lista de pedidos abertos é lida, os envios esperam aqui (a mensagem já aparece na conversa). */
  const recoveringRef = useRef(false);
  const deferredRef = useRef<Array<() => void>>([]);
  const onEntitiesChangedRef = useRef(onEntitiesChanged);

  useEffect(() => {
    onEntitiesChangedRef.current = onEntitiesChanged;
  }, [onEntitiesChanged]);

  const commitMessages = useCallback((update: (current: AgentChatMessage[]) => AgentChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const commitTraces = useCallback((update: (current: AgentChatTrace[]) => AgentChatTrace[]) => {
    tracesRef.current = update(tracesRef.current);
    setTraces(tracesRef.current);
  }, []);

  /** Abre o rastro do pedido ou atualiza o que ja existe. */
  const showTrace = useCallback(
    (next: AgentChatTrace) => {
      commitTraces((current) =>
        current.some((entry) => entry.id === next.id)
          ? current.map((entry) => (entry.id === next.id ? next : entry))
          : [...current, next]);
    },
    [commitTraces],
  );

  const commitPending = useCallback((next: AgentChatPending | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  /** Comecar de novo e estado local: limpa a tela, a sessao e volta ao assistente da agenda. */
  const startNewConversation = useCallback(() => {
    if (pendingRef.current) return;
    commitHermesMode(false);
    commitPending(null);
    followingRef.current.clear();
    sessionRef.current = undefined;
    messagesRef.current = [];
    setMessages([]);
    tracesRef.current = [];
    setTraces([]);
  }, [commitHermesMode, commitPending]);

  const fail = useCallback(
    (id: string, code: ChatFailureCode) => {
      if (!followingRef.current.has(id)) return;
      followingRef.current.delete(id);
      if (pendingRef.current?.id === id) commitPending(null);
      const found = messagesRef.current.find((message) => message.id === id);
      const request = found?.role === "user" ? found : undefined;
      commitMessages((current) => [
        ...current.map((message) =>
          message.id === id && message.role === "user" && code !== "cancelled" ? { ...message, failed: true } : message,
        ),
        {
          id: `${id}-error`,
          role: "error",
          text: ERROR_TEXTS[code],
          retryText: request?.text ?? "",
          messageId: id,
          reuseMessageId: RESUMABLE.has(code),
        },
      ]);
      // O pedido acabou sem resposta: o rastro para de girar onde estava.
      commitTraces((current) => current.map((entry) => (entry.id === id ? { ...entry, running: false } : entry)));
      if (code === "connection_lost") onEntitiesChangedRef.current?.();
    },
    [commitMessages, commitPending, commitTraces],
  );

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      commitPending(null);
    };
  }, [commitPending]);

  /** Mostra o estado do pedido na caixa de processo e no rastro da aba "Processo". */
  const applyView = useCallback(
    (id: string, view: RequestDto) => {
      const processId = `${id}-process`;
      commitMessages((current) =>
        current.map((message) => (message.id === processId ? { id: processId, role: "process", request: view } : message)));
      commitTraces((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, running: isRequestOpen(view), trace: view.trace ?? null } : entry));
      // O Hermes não grava passos: os pensamentos e as ferramentas vêm do rastro, ao vivo e depois do fim.
      if (view.route === "hermes") {
        const steps = hermesStepsOf(view.trace?.entries);
        if (steps.length > 0) {
          const stepsId = `${id}-steps`;
          const message: AgentChatMessage = { id: stepsId, role: "hermes-steps", steps, running: isRequestOpen(view) };
          commitMessages((current) =>
            current.some((entry) => entry.id === stepsId)
              ? current.map((entry) => (entry.id === stepsId ? message : entry))
              : [...current, message]);
        }
      }
    },
    [commitMessages, commitTraces],
  );

  /** O pedido terminou: feito (com a agenda atualizada se algo mudou), ou falhou / foi cancelado. */
  const finishRequest = useCallback(
    (id: string, view: RequestDto) => {
      applyView(id, view);
      if (view.status === "done") {
        followingRef.current.delete(id);
        if (pendingRef.current?.id === id) commitPending(null);
        if (view.route === "hermes") {
          // A resposta do Hermes entra na conversa; ele pode ter mexido em qualquer registro, então a agenda atualiza.
          commitMessages((current) => [...current, { id: `${id}-answer`, role: "assistant", text: view.message ?? "", entities: [] }]);
          onEntitiesChangedRef.current?.();
          return;
        }
        // Criar, editar e vincular mudam a agenda; uma consulta pura ou uma resposta nao.
        if (view.entities.length > 0) onEntitiesChangedRef.current?.();
        return;
      }
      // Um pedido que falhou ou foi cancelado pode ter gravado algo antes de parar.
      if (view.entities.length > 0) onEntitiesChangedRef.current?.();
      fail(id, view.status === "cancel" ? "cancelled" : (view.errorCode ?? "internal"));
    },
    [applyView, commitMessages, commitPending, fail],
  );

  /**
   * Segue o pedido ate o fim: a caixa mostra cada passo com seu estado. O pedido ja foi aceito pela API
   * (`requestId`); se a consulta falhar, o mesmo id (reenvio do "Tentar de novo") retoma o acompanhamento.
   */
  const followRequest = useCallback(
    async (id: string, requestId: string): Promise<void> => {
      const deadline = Date.now() + PROCESS_TIMEOUT_MS;
      let failures = 0;
      while (!disposedRef.current && followingRef.current.has(id)) {
        try {
          const view = await getRequest(requestId);
          failures = 0;
          if (disposedRef.current || !followingRef.current.has(id)) return;
          if (!isRequestOpen(view)) {
            finishRequest(id, view);
            return;
          }
          applyView(id, view);
        } catch (error) {
          failures += 1;
          if (error instanceof ApiError && error.status === 401) {
            fail(id, "session_expired");
            return;
          }
          if (failures >= PROCESS_POLL_FAILURES) {
            fail(id, "connection_lost");
            return;
          }
        }
        if (Date.now() > deadline) {
          fail(id, "connection_lost");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, processPollMs));
      }
    },
    [applyView, fail, finishRequest, processPollMs],
  );

  /**
   * Abre o pedido na API (com o id da mensagem como `clientMessageId` e, depois da primeira, o da primeira
   * mensagem como `sessionId`) e o acompanha ate o fim.
   */
  const runRequest = useCallback(
    async (id: string, text: string): Promise<void> => {
      if (!userId) return;
      let requestId: string;
      try {
        requestId = await startRequest({
          userId,
          text,
          ...(context ? { context } : {}),
          ...(sessionRef.current ? { sessionId: sessionRef.current } : {}),
          clientMessageId: id,
        });
      } catch (error) {
        fail(id, startFailureCode(error));
        return;
      }
      sessionRef.current ??= requestId;
      knownRequestsRef.current.add(requestId);

      const processId = `${id}-process`;
      commitMessages((current) => [
        ...current.filter((message) => message.id !== processId),
        { id: processId, role: "process", request: null },
      ]);
      showTrace({ id, request: text, route: "steps", running: true, trace: null });
      commitPending({ id, label: "Realizando processos", requestId });
      await followRequest(id, requestId);
    },
    [commitMessages, commitPending, context, fail, followRequest, showTrace, userId],
  );

  /**
   * `/hermes <mensagem>`: a mensagem vira um pedido na rota do Hermes, com o id da mensagem (reenviar não abre
   * outro) e a sessão. O pedido é acompanhado como os demais: os passos vêm do rastro e a resposta, em
   * `message`. Com o Hermes desligado a API responde não encontrado: o chat avisa e sai do modo.
   */
  const runHermes = useCallback(
    async (id: string, text: string): Promise<void> => {
      if (!userId) return;
      let request: RequestDto;
      try {
        request = await sendHermesMessage({
          userId,
          text,
          clientMessageId: id,
          ...(sessionRef.current ? { sessionId: sessionRef.current } : {}),
        });
      } catch (error) {
        if (error instanceof HermesOffError) {
          commitHermesMode(false);
          followingRef.current.delete(id);
          commitPending(null);
          commitMessages((current) => [...current, { id: `${id}-hermes`, role: "assistant", text: HERMES_DISABLED_TEXT, entities: [] }]);
          return;
        }
        fail(id, startFailureCode(error));
        return;
      }
      sessionRef.current ??= request.id;
      knownRequestsRef.current.add(request.id);

      showTrace({ id, request: text, route: "hermes", running: true, trace: null });
      commitPending({ id, label: "Falando com o Hermes", requestId: request.id });
      await followRequest(id, request.id);
    },
    [commitHermesMode, commitMessages, commitPending, fail, followRequest, showTrace, userId],
  );

  /** Envia uma mensagem com o id dado (o da mensagem nova, ou o de uma mensagem que falhou ao ser reenviada). */
  const dispatch = useCallback(
    (text: string, id: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed || !userId || pendingRef.current) return false;

      const command = parseChatCommand(trimmed);
      const notice = (text: string) => ({ id: `${id}-notice`, role: "assistant" as const, text, entities: [] });

      // `/hermes` sozinho so liga o modo; `/app` o desliga. Nenhum dos dois vai ao servidor.
      if (command?.kind === "leave" && hermesModeRef.current) {
        commitHermesMode(false);
        commitMessages((current) => [...current, { id, role: "user", text: trimmed }, notice(HERMES_LEAVE_TEXT)]);
        return true;
      }
      if (command?.kind === "hermes" && command.text === null) {
        commitHermesMode(true);
        commitMessages((current) => [...current, { id, role: "user", text: trimmed }, notice(HERMES_ENTER_TEXT)]);
        return true;
      }
      if (command?.kind === "hermes") commitHermesMode(true);

      commitMessages((current) => [...current, { id, role: "user", text: trimmed }]);
      followingRef.current.add(id);
      commitPending({ id });
      const hermesText = command?.kind === "hermes" ? command.text : hermesModeRef.current ? trimmed : null;
      const run = () => {
        if (hermesText !== null) void runHermes(id, hermesText);
        else void runRequest(id, trimmed);
      };
      if (recoveringRef.current) deferredRef.current.push(run);
      else run();
      return true;
    },
    [commitHermesMode, commitMessages, commitPending, runHermes, runRequest, userId],
  );

  const send = useCallback((text: string) => dispatch(text, operationId()), [dispatch]);

  /** Tira o pedido que falhou e o erro dele, e manda o texto de novo (com o mesmo id, se a falha foi de rede). */
  const retry = useCallback(
    (errorId: string) => {
      const error = messagesRef.current.find((message) => message.id === errorId);
      if (error?.role !== "error" || pendingRef.current) return;
      const { messageId, reuseMessageId, retryText } = error;
      commitMessages((current) =>
        current.filter((message) =>
          message.id !== errorId && message.id !== messageId && message.id !== `${messageId}-process` && message.id !== `${messageId}-steps`));
      commitTraces((current) => current.filter((entry) => entry.id !== messageId));
      dispatch(retryText, reuseMessageId ? messageId : operationId());
    },
    [commitMessages, commitTraces, dispatch],
  );

  /** Cancela o pedido aberto pela API. O que ja foi gravado continua gravado; o pedido termina como cancelado. */
  const cancel = useCallback(() => {
    const current = pendingRef.current;
    if (!current?.requestId) return;
    const { id, requestId } = current;
    cancelRequest(requestId).then(
      (view) => {
        if (pendingRef.current?.id === id) finishRequest(id, view);
      },
      () => {
        // Sem resposta do cancelamento não se sabe o estado: o reenvio retoma o mesmo pedido.
        fail(id, "connection_lost");
      },
    );
  }, [fail, finishRequest]);

  /**
   * Ao abrir o chat: lê a lista de pedidos e volta a acompanhar os que ainda estão na fila, executando ou
   * aguardando (rota por passos ou Hermes), como um pedido recém-enviado. Não repete o que a conversa já mostra
   * ou enviou, nem o que já terminou. Um envio feito enquanto a lista é lida espera o fim dela: assim o pedido
   * enviado não aparece na lista sem o id que a tela já conhece. Sem lista (rede), a conversa segue.
   */
  const recover = useCallback(async (): Promise<void> => {
    if (!userId || recoveringRef.current) return;
    recoveringRef.current = true;
    let open: ChatRouteRequest[] = [];
    try {
      // A lista vem do mais novo para o mais antigo; a conversa mostra do mais antigo para o mais novo.
      open = (await listRequests()).filter(isOpenChatRequest).filter((request) => !knownRequestsRef.current.has(request.id)).reverse();
    } catch {
      // Sem a lista, o que estava em aberto não volta; a conversa continua como estava.
    }
    recoveringRef.current = false;
    if (disposedRef.current) return;

    if (open.length > 0) {
      const restored: AgentChatMessage[] = [];
      for (const request of open) {
        knownRequestsRef.current.add(request.id);
        followingRef.current.add(request.id);
        restored.push({ id: request.id, role: "user", text: request.text ?? request.title });
        if (request.route === "steps") restored.push({ id: `${request.id}-process`, role: "process", request });
      }
      commitMessages((current) => [...restored, ...current]);
      commitTraces((current) => [
        ...open.map((request) => ({
          id: request.id,
          request: request.text ?? request.title,
          route: request.route,
          running: true,
          trace: null,
        })),
        ...current,
      ]);
      const newest = open[open.length - 1];
      if (newest && !pendingRef.current) {
        const label = newest.route === "hermes" ? "Falando com o Hermes" : "Realizando processos";
        commitPending({ id: newest.id, label, requestId: newest.id });
      }
      for (const request of open) void followRequest(request.id, request.id);
    }

    for (const run of deferredRef.current.splice(0)) run();
  }, [commitMessages, commitPending, commitTraces, followRequest, userId]);

  return {
    messages,
    pending,
    /** O rastro de cada pedido da conversa, para a aba "Processo". */
    traces,
    ready: Boolean(userId),
    recover,
    /** `true` enquanto as mensagens vao ao Hermes (`/hermes`); `/app` volta ao assistente da agenda. */
    hermesMode,
    send,
    retry,
    cancel,
    startNewConversation,
  };
}
