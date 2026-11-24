"use client";

import type { RequestDto } from "@repo/contracts";
import { ArrowUp, FileText, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "@/components/detail/entity-ai-edit-bar.module.css";
import { useHermesDock } from "@/components/ui/hermes-flight";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { agentFailureText, startFailureCode } from "@/lib/agent-chat/use-agent-chat";
import { requestAgentFileEdit } from "@/lib/api/agent-files";
import { operationId } from "@/lib/api/operation-id";
import { HermesOffError, getRequest } from "@/lib/api/requests";
import { AGENT_REQUEST_POLL_MS, isOpenRequest, runningStepLabel } from "@/lib/tasks/agent-request-model";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";

interface AgentFileEditBarProps {
  /** Caminho do arquivo na pasta do Hermes: é o que o pedido edita. */
  path: string;
  /** O pedido terminou: a tela relê o texto do arquivo. */
  onDone: () => void;
  pollMs?: number;
}

/** Falhas seguidas ao consultar o pedido antes de desistir de acompanhá-lo. */
const POLL_FAILURES = 5;
const LOST_TEXT = "Perdi a conexão antes da resposta. Confira o arquivo antes de repetir.";
const HERMES_OFF_TEXT = "O Hermes está desligado neste servidor.";

/**
 * O campo do Hermes no pé do detalhe de um arquivo de skill ou agente (ticket 39). O que se escreve vira um pedido de
 * edição do arquivo (`POST /api/ai/config/edit-request`): o Hermes avalia o pedido antes de editar. O campo acompanha
 * o pedido com `getRequest` até o estado final, mostra a resposta e avisa a tela para reler o texto.
 * Com o Hermes desligado no servidor (a API responde 404), o campo some e a tela diz isso.
 */
export function AgentFileEditBar({ path, onDone, pollMs = AGENT_REQUEST_POLL_MS }: AgentFileEditBarProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hermesOff, setHermesOff] = useState(false);
  // O pedido que o campo abriu nesta tela; `null` enquanto nenhum foi aberto ou depois de "Fechar".
  const [followed, setFollowed] = useState<RequestDto | null>(null);
  const [lost, setLost] = useState(false);
  // No celular, o botão do Hermes da barra inferior pousa no status deste campo.
  const barRef = useRef<HTMLElement>(null);
  useHermesDock(barRef);
  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
  });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const notifiedId = useRef<string | null>(null);

  const open = followed !== null && isOpenRequest(followed.status);
  const finished = followed !== null && !open;
  const busy = sending || open;

  // Acompanha o pedido enquanto ele está aberto; uma leitura por vez, e para depois de várias falhas seguidas.
  const followId = followed?.id ?? null;
  useEffect(() => {
    if (!followId || !open || lost) return;
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    const read = () => {
      if (inFlight) return;
      inFlight = true;
      getRequest(followId)
        .then((view) => {
          if (cancelled) return;
          failures = 0;
          setFollowed(view);
        }, () => {
          if (cancelled) return;
          failures += 1;
          if (failures >= POLL_FAILURES) setLost(true);
        })
        .finally(() => {
          inFlight = false;
        });
    };
    read();
    const timer = setInterval(read, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [followId, open, lost, pollMs]);

  // Ao terminar (ou ao chegar já terminado), avisa a tela uma vez por pedido: ela relê o arquivo.
  useEffect(() => {
    if (!followed || open || notifiedId.current === followed.id) return;
    notifiedId.current = followed.id;
    onDoneRef.current();
  }, [followed, open]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (busy || !message) return;
    setSending(true);
    setError(null);
    setLost(false);
    try {
      const accepted = await requestAgentFileEdit({ path, request: message, clientMessageId: operationId() });
      setText("");
      setFollowed(accepted);
    } catch (failure) {
      if (failure instanceof HermesOffError) setHermesOff(true);
      else setError(agentFailureText(startFailureCode(failure)));
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

  function dismiss() {
    if (open && !lost) return;
    setFollowed(null);
    setLost(false);
    setError(null);
  }

  if (hermesOff) {
    return (
      <section className={styles.bar} data-agent-file-bar>
        <p className={styles.reason} role="status">{HERMES_OFF_TEXT}</p>
      </section>
    );
  }

  const failed = followed?.status === "failed";
  const message = lost ? LOST_TEXT
    : followed?.status === "done" ? (followed.message ?? null)
    : failed ? agentFailureText(followed.errorCode ?? "internal")
    : followed?.status === "cancel" ? agentFailureText("cancelled")
    : null;
  const shown = error ?? message;
  const hasFailure = error !== null || failed || lost;
  const state: HermesState = speech.listening ? "listening"
    : sending || open ? "thinking"
    : followed?.status === "done" ? "done"
    : hasFailure ? "error"
    : "idle";
  const statusText = speech.listening ? "Ouvindo…"
    : sending ? "Enviando o pedido…"
    : lost ? "Não consegui acompanhar o pedido"
    : open ? (followed?.progress ?? (followed ? runningStepLabel(followed) : undefined) ?? "Entendendo o pedido…")
    : followed?.status === "done" ? "Pronto"
    : failed ? "Não deu certo"
    : followed?.status === "cancel" ? "Pedido cancelado"
    : "Esperando o seu pedido";
  const canDismiss = finished || lost;

  return (
    <section ref={barRef} className={styles.bar} data-agent-file-bar aria-label="Pedir ao Hermes uma edição neste arquivo">
      {shown ? (
        <div className={styles.result}>
          <p className={styles.message} data-failed={hasFailure} role={error ? "alert" : undefined}>{shown}</p>
        </div>
      ) : null}
      <p className={styles.status} data-state={state} role="status" aria-live="polite">
        <HermesMark state={state} plain />
        <span>{statusText}</span>
        {canDismiss ? (
          <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fechar resultado"><X aria-hidden /></button>
        ) : null}
      </p>
      <form className={styles.form} aria-label="Pedido ao Hermes" onSubmit={(event) => void send(event)}>
        <div className={styles.context}>
          <span className={styles.contextIcon} aria-hidden><FileText /></span>
          <span className={styles.contextText}>
            <span>Pedido de edição</span>
            <span>{path.split("/").pop()}</span>
          </span>
        </div>
        <div className={styles.row}>
          <textarea
            className={styles.input}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Peça uma mudança neste arquivo"
            aria-label="Pedir ao Hermes uma edição neste arquivo"
            maxLength={4000}
            disabled={busy}
            autoComplete="off"
          />
          {speech.supported ? (
            <button
              type="button"
              className={styles.voice}
              aria-pressed={speech.listening}
              onClick={speech.listening ? speech.stop : speech.start}
              disabled={busy}
              aria-label={speech.listening ? "Parar de transcrever" : "Transcrever o que eu disser"}
            >
              <HermesGlyph />
            </button>
          ) : null}
          <button type="submit" className={styles.send} disabled={busy || !text.trim()} aria-label={sending ? "Aguardando a resposta" : "Enviar pedido"}>
            <ArrowUp aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
