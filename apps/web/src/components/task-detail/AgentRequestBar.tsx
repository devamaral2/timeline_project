"use client";

import { currentCoordinates } from "@/lib/geolocation/current-coordinates";
import type { RequestDto } from "@repo/contracts";
import { ArrowUp, MessageSquare } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { useHermesDock } from "@/components/ui/hermes-flight";
import styles from "@/components/detail/entity-ai-edit-bar.module.css";
import agentStyles from "./agent-task-detail.module.css";
import { agentFailureText } from "@/lib/agent-chat/use-agent-chat";
import { operationId } from "@/lib/api/operation-id";
import { FoodCancelConflictError, cancelRequest, getRequest, startRequest } from "@/lib/api/requests";
import { isOpenRequest, runningStepLabel } from "@/lib/tasks/agent-request-model";
import { momentLabel } from "@/lib/tasks/task-read-model";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { AGENT_REQUEST_POLL_MS } from "./use-agent-request";

interface AgentRequestBarProps {
  userId: string;
  /** O pedido do evento de agente, como a tela o mostra. */
  request: RequestDto;
  /** Um cancelamento que devolveu o pedido do evento: a tela o aplica sem reler. */
  onRequestChange: (view: RequestDto) => void;
}

/**
 * O campo do agente no pé do detalhe de um evento de agente. Mesmo desenho do campo de IA (uma linha de status, o
 * cartão com o pedido e a caixa de texto), ligado direto ao cliente de pedidos: a linha de status acompanha o pedido
 * em aberto (o do evento, ou o último que o campo abriu) e oferece "Cancelar pedido" enquanto ele está em andamento.
 * Enviar abre um pedido novo na mesma sessão e passa a acompanhá-lo com `getRequest`.
 */
export function AgentRequestBar({ userId, request, onRequestChange }: AgentRequestBarProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pedido que o campo abriu nesta tela; `null` enquanto ainda não há o primeiro estado dele.
  const [followId, setFollowId] = useState<string | null>(null);
  const [followed, setFollowed] = useState<RequestDto | null>(null);
  // No celular, o botão do Hermes da barra inferior pousa no status deste campo.
  const barRef = useRef<HTMLElement>(null);
  useHermesDock(barRef);
  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
  });

  const followingOpen = followed === null || isOpenRequest(followed.status);
  useEffect(() => {
    if (!followId || !followingOpen) return;
    let cancelled = false;
    let busy = false;
    const read = () => {
      if (busy) return;
      busy = true;
      getRequest(followId)
        .then((view) => {
          if (!cancelled) setFollowed(view);
        })
        .catch(() => {
          // Falha numa leitura: a próxima batida tenta de novo.
        })
        .finally(() => {
          busy = false;
        });
    };
    read();
    const timer = setInterval(read, AGENT_REQUEST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [followId, followingOpen]);

  // O pedido que a linha de status mostra: o que o campo acompanha, ou o do evento enquanto nenhum foi aberto.
  const tracked: RequestDto | null = followId ? followed : request;
  const open = tracked !== null && isOpenRequest(tracked.status);
  const state: HermesState = speech.listening ? "listening"
    : open || (tracked === null) ? "thinking"
    : tracked.status === "done" ? "done"
    : tracked.status === "failed" ? "error"
    : "idle";
  const disabled = sending || cancelling || !tracked;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (disabled || !message || !tracked) return;
    setSending(true);
    setError(null);
    try {
      const sessionId = tracked.sessionId ?? tracked.id;
      const coordinates = await currentCoordinates();
      const id = await startRequest({
        userId, text: message, sessionId, clientMessageId: operationId(),
        ...(coordinates ? { context: { screen: "detail", coordinates } } : {}),
      });
      setText("");
      setFollowed(null);
      setFollowId(id);
    } catch {
      setError(agentFailureText("connection_failed"));
    } finally {
      setSending(false);
    }
  }

  /** Enter envia; Shift+Enter quebra a linha. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  async function cancel() {
    if (!tracked || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const view = await cancelRequest(tracked.id);
      if (followId) setFollowed(view);
      else onRequestChange(view);
    } catch (failure) {
      setError(failure instanceof FoodCancelConflictError ? failure.message : agentFailureText("connection_failed"));
    } finally {
      setCancelling(false);
    }
  }

  const statusText = speech.listening ? "Ouvindo…"
    : tracked === null ? "Enviando o pedido…"
    : open ? (tracked.progress ?? runningStepLabel(tracked) ?? "Entendendo o pedido…")
    : tracked.status === "done" ? "Pronto"
    : tracked.status === "failed" ? "Não deu certo"
    : tracked.status === "cancel" ? "Pedido cancelado"
    : "Esperando o seu pedido";
  const failureReason = followId && tracked?.status === "failed" ? agentFailureText(tracked.errorCode ?? "internal") : null;

  return (
    <section ref={barRef} className={styles.bar} data-agent-request-bar aria-label="Editar este pedido com IA">
      {error ? <p className={styles.message} data-failed="true" role="alert">{error}</p> : null}
      {failureReason ? <p className={styles.message} data-failed="true">{failureReason}</p> : null}
      <p className={styles.status} data-state={state} role="status" aria-live="polite">
        <HermesMark state={state} />
        <span>{statusText}</span>
        {open ? (
          <button type="button" className={agentStyles.cancel} onClick={() => void cancel()} disabled={cancelling}>
            Cancelar pedido
          </button>
        ) : null}
      </p>
      <form className={styles.form} aria-label="Pedido ao Hermes" onSubmit={(event) => void send(event)}>
        {tracked ? (
          <div className={styles.context}>
            <span className={styles.contextIcon} aria-hidden><MessageSquare /></span>
            <span className={styles.contextText}>
              <span>{`Pedido · ${momentLabel(tracked.createdAt)}`}</span>
              <span>{tracked.title}</span>
            </span>
          </div>
        ) : null}
        <div className={styles.row}>
          <textarea
            className={styles.input}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Responda ou peça uma mudança"
            aria-label="Pedir à IA para editar este pedido"
            maxLength={4000}
            disabled={sending || !tracked}
            autoComplete="off"
          />
          {speech.supported ? (
            <button
              type="button"
              className={styles.voice}
              aria-pressed={speech.listening}
              onClick={speech.listening ? speech.stop : speech.start}
              disabled={disabled}
              aria-label={speech.listening ? "Parar de transcrever" : "Transcrever o que eu disser"}
            >
              <HermesGlyph />
            </button>
          ) : null}
          <button type="submit" className={styles.send} disabled={disabled || !text.trim()} aria-label={sending ? "Aguardando a resposta" : "Enviar pedido"}>
            <ArrowUp aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
