"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/authed-fetch";
import type { AgentChatEntityRef, AgentScreenContext, AgentTraceDto, AiProcessDto } from "@/lib/api/contracts";
import { type AiProcessApi, aiProcess, isProcessTerminal } from "@/lib/ai-process/ai-process";
import {
  type AiAutomationApi,
  type HermesStepDto,
  aiAutomation,
  isAutomationRouteOff,
  isHermesTurnTerminal,
  parseChatCommand,
} from "@/lib/ai-automation/ai-automation";
import { operationId } from "@/lib/ai-jobs/ai-jobs";

export type AgentChatMessage =
  | { id: string; role: "user"; text: string; failed?: boolean }
  | { id: string; role: "assistant"; text: string; entities: AgentChatEntityRef[] }
  | { id: string; role: "error"; text: string; retryText: string; requestId: string }
  /** A caixa de processo (ADR 003): `null` ate o servidor responder o primeiro estado. Nao entra no historico. */
  | { id: string; role: "process"; process: AiProcessDto | null }
  /** Os passos do Hermes (ferramentas e pensamentos), ao vivo e depois do fim do turno. Nao entra no historico. */
  | { id: string; role: "hermes-steps"; steps: HermesStepDto[]; running: boolean };

/**
 * O rastro de um pedido, para a aba "Processo": um por pedido enviado, na ordem da conversa. `trace` fica
 * `null` ate o servidor responder o primeiro estado (ou quando ele nao manda rastro).
 */
export interface AgentChatTrace {
  /** O id do pedido: o mesmo da mensagem do usuario. */
  id: string;
  request: string;
  route: "process" | "hermes";
  running: boolean;
  trace: AgentTraceDto | null;
}

export interface AgentChatPending {
  id: string;
  label?: string;
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
  /** A rota de IA por processo; ausente, vale a real. */
  processApi?: AiProcessApi;
  processPollMs?: number;
  /** A rota do Hermes (`/hermes <mensagem>`); ausente, vale a real. */
  automationApi?: AiAutomationApi;
  automationPollMs?: number;
}

/** Quanto tempo a caixa de processo espera o servidor terminar antes de dar o pedido como perdido. */
const PROCESS_TIMEOUT_MS = 180_000;
/** Falhas seguidas ao consultar o processo antes de desistir de acompanhar. */
const PROCESS_POLL_FAILURES = 5;
/** O Hermes pode usar modelo e ferramentas; espera mais que um turno comum antes de dar por perdido. */
const HERMES_TIMEOUT_MS = 180_000;
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

/**
 * A conversa da agenda. Cada pedido vai pela rota de processo (ADR 003) ou, com `/hermes`, ao Hermes
 * (ADR 004). O historico e so do que esta na tela: nada e recarregado do servidor.
 */
export function useAgentChat({
  userId,
  context,
  onEntitiesChanged,
  processApi = aiProcess,
  processPollMs = 1000,
  automationApi = aiAutomation,
  automationPollMs = 1000,
}: UseAgentChatOptions) {
  const disposedRef = useRef(false);
  /** `/hermes` liga o modo: as mensagens seguintes vao ao Hermes ate `/app`, ou ate comecar de novo. */
  const hermesModeRef = useRef(false);
  const [hermesMode, setHermesMode] = useState(false);
  const commitHermesMode = useCallback((next: boolean) => {
    hermesModeRef.current = next;
    setHermesMode(next);
  }, []);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [pending, setPending] = useState<AgentChatPending | null>(null);
  const [traces, setTraces] = useState<AgentChatTrace[]>([]);
  const tracesRef = useRef(traces);
  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
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

  /** Comecar de novo e estado local: limpa a tela e volta ao assistente da agenda. */
  const startNewConversation = useCallback(() => {
    if (pendingRef.current) return;
    commitHermesMode(false);
    commitPending(null);
    messagesRef.current = [];
    setMessages([]);
    tracesRef.current = [];
    setTraces([]);
  }, [commitHermesMode, commitPending]);

  const fail = useCallback(
    (id: string, code: ChatFailureCode) => {
      if (pendingRef.current?.id !== id) return;
      commitPending(null);
      const found = messagesRef.current.find((message) => message.id === id);
      const request = found?.role === "user" ? found : undefined;
      commitMessages((current) => [
        ...current.map((message) =>
          message.id === id && message.role === "user" ? { ...message, failed: true } : message,
        ),
        { id: `${id}-error`, role: "error", text: ERROR_TEXTS[code], retryText: request?.text ?? "", requestId: id },
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

  /**
   * Segue o processo ate o fim: a caixa mostra cada passo com seu estado.
   */
  const runProcess = useCallback(
    async (id: string, text: string): Promise<void> => {
      if (!userId) return;
      let processId: string;
      try {
        ({ processId } = await processApi.start({ userId, text, ...(context ? { context } : {}) }));
      } catch (error) {
        fail(id, error instanceof ApiError && error.status === 401 ? "session_expired" : "connection_failed");
        return;
      }

      const messageId = `${id}-process`;
      commitMessages((current) => [...current, { id: messageId, role: "process", process: null }]);
      showTrace({ id, request: text, route: "process", running: true, trace: null });
      commitPending({ id, label: "Realizando processos" });
      const deadline = Date.now() + PROCESS_TIMEOUT_MS;
      let failures = 0;
      while (!disposedRef.current && pendingRef.current?.id === id) {
        try {
          const view = await processApi.get(processId);
          failures = 0;
          if (disposedRef.current || pendingRef.current?.id !== id) return;
          commitMessages((current) =>
            current.map((message) => (message.id === messageId ? { id: messageId, role: "process", process: view } : message)));
          showTrace({ id, request: text, route: "process", running: !isProcessTerminal(view), trace: view.trace ?? null });
          if (isProcessTerminal(view)) {
            commitPending(null);
            // Criar, editar e vincular mudam a agenda; uma consulta pura ou uma resposta nao.
            if (view.entities.length > 0) onEntitiesChangedRef.current?.();
            return;
          }
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
      return;
    },
    [commitMessages, commitPending, context, fail, processApi, processPollMs, showTrace, userId],
  );

  /**
   * `/hermes <mensagem>`: a API entrega a mensagem ao Hermes e o chat mostra a resposta dele. A resposta e
   * transitoria (nao entra no historico da conversa) e, como o Hermes pode ter criado ou editado registros,
   * a agenda e atualizada ao fim.
   */
  const runHermes = useCallback(
    async (id: string, text: string): Promise<void> => {
      if (!userId) return;
      const replyId = `${id}-hermes`;
      let jobId: string;
      try {
        ({ id: jobId } = await automationApi.start({
          userId,
          text,
          clientMessageId: id,
        }));
      } catch (error) {
        if (isAutomationRouteOff(error)) {
          commitHermesMode(false);
          commitPending(null);
          commitMessages((current) => [...current, { id: replyId, role: "assistant", text: HERMES_DISABLED_TEXT, entities: [] }]);
          return;
        }
        const code = error instanceof ApiError && error.status === 401 ? "session_expired" : "connection_failed";
        fail(id, code);
        return;
      }

      commitPending({ id, label: "Falando com o Hermes" });
      showTrace({ id, request: text, route: "hermes", running: true, trace: null });
      const stepsId = `${id}-steps`;
      const showSteps = (steps: HermesStepDto[], running: boolean) => {
        const message: AgentChatMessage = { id: stepsId, role: "hermes-steps", steps, running };
        commitMessages((current) =>
          current.some((entry) => entry.id === stepsId)
            ? current.map((entry) => (entry.id === stepsId ? message : entry))
            : [...current, message],
        );
      };
      const deadline = Date.now() + HERMES_TIMEOUT_MS;
      let failures = 0;
      while (!disposedRef.current && pendingRef.current?.id === id) {
        try {
          const job = await automationApi.get(jobId);
          failures = 0;
          if (disposedRef.current || pendingRef.current?.id !== id) return;
          const steps = job.steps ?? [];
          if (steps.length > 0) showSteps(steps, !isHermesTurnTerminal(job));
          showTrace({ id, request: text, route: "hermes", running: !isHermesTurnTerminal(job), trace: job.trace ?? null });
          if (isHermesTurnTerminal(job)) {
            if (job.status === "succeeded" && job.result) {
              commitPending(null);
              const reply = job.result.text;
              commitMessages((current) => [...current, { id: replyId, role: "assistant", text: reply, entities: [] }]);
              onEntitiesChangedRef.current?.();
            } else {
              fail(id, job.errorCode === "cancelled" ? "cancelled" : "unavailable");
            }
            return;
          }
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
        await new Promise((resolve) => setTimeout(resolve, automationPollMs));
      }
    },
    [automationApi, automationPollMs, commitHermesMode, commitMessages, commitPending, fail, showTrace, userId],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId || pendingRef.current) return false;

      const id = operationId();
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
      commitPending({ id });
      const hermesText = command?.kind === "hermes" ? command.text : hermesModeRef.current ? trimmed : null;
      if (hermesText !== null) void runHermes(id, hermesText);
      else void runProcess(id, trimmed);
      return true;
    },
    [commitHermesMode, commitMessages, commitPending, runHermes, runProcess, userId],
  );

  /** Tira o pedido que falhou e o erro dele, e manda o texto de novo. */
  const retry = useCallback(
    (errorId: string) => {
      const error = messagesRef.current.find((message) => message.id === errorId);
      if (error?.role !== "error" || pendingRef.current) return;
      const { requestId } = error;
      commitMessages((current) => current.filter((message) => message.id !== errorId && message.id !== requestId));
      commitTraces((current) => current.filter((entry) => entry.id !== requestId));
      send(error.retryText);
    },
    [commitMessages, commitTraces, send],
  );

  return {
    messages,
    pending,
    /** O rastro de cada pedido da conversa, para a aba "Processo". */
    traces,
    ready: Boolean(userId),
    /** `true` enquanto as mensagens vao ao Hermes (`/hermes`); `/app` volta ao assistente da agenda. */
    hermesMode,
    send,
    retry,
    startNewConversation,
  };
}
