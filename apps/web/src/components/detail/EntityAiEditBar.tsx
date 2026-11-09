"use client";

import { ArrowUp, Check, Circle, LoaderCircle, Mic, Square, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { AiProcessEditApi } from "@/lib/ai-process/ai-process";
import { EDIT_TARGET_LABELS } from "@/lib/ai-process/entity-edit";
import { useEntityAiEdit } from "@/lib/ai-process/use-entity-ai-edit";
import type { AiProcessEditEntityType } from "@/lib/api/contracts";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import styles from "./entity-ai-edit-bar.module.css";

interface EntityAiEditBarProps {
  userId: string;
  entityType: AiProcessEditEntityType;
  entityId: string;
  /** A edicao terminou e mudou algo: a tela recarrega a entidade. */
  onEdited: () => void;
  /** Desliga o campo com o motivo (por exemplo, a refeicao ainda esta sendo gerada). */
  disabledReason?: string;
  api?: AiProcessEditApi;
  pollMs?: number;
}

/**
 * O campo de conversa com a IA no pe das telas de detalhe (ADR 006): o que se escreve edita a entidade aberta.
 * O servidor escolhe o agente pelo tipo; aqui so se envia o texto e se acompanha o processo.
 */
export function EntityAiEditBar({ userId, entityType, entityId, onEdited, disabledReason, api, pollMs }: EntityAiEditBarProps) {
  const [text, setText] = useState("");
  const { phase, process, error, submit, dismiss, busy } = useEntityAiEdit({ userId, entityType, entityId, onEdited, api, pollMs });
  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
  });
  const target = EDIT_TARGET_LABELS[entityType];
  const disabled = busy || Boolean(disabledReason);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (disabled || !text.trim()) return;
    const request = text;
    setText("");
    const accepted = await submit(request);
    if (!accepted) setText(request);
  }

  const steps = process?.steps ?? [];
  const message = phase === "failed" ? error : process?.message;
  return (
    <section className={styles.bar} aria-label={`Editar ${target} com IA`}>
      {phase !== "idle" ? (
        <div className={styles.result} data-phase={phase} role="status" aria-live="polite">
          <div className={styles.resultHead}>
            <p className={styles.title}>{phase === "done" ? "Pronto" : phase === "failed" ? "Não deu certo" : (process?.title ?? "Realizando processos:")}</p>
            {phase === "done" || phase === "failed" ? (
              <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fechar resultado"><X aria-hidden /></button>
            ) : null}
          </div>
          {steps.length === 0 && (phase === "sending" || phase === "running") ? (
            <p className={styles.waiting}><LoaderCircle aria-hidden data-spin />Entendendo o pedido…</p>
          ) : null}
          <ul className={styles.steps} aria-label="Passos do processo">
            {steps.map((step) => (
              <li key={step.id} data-status={step.status}>
                <span className={styles.mark} aria-hidden>
                  {step.status === "succeeded" && <Check />}
                  {step.status === "failed" && <X />}
                  {step.status === "running" && <LoaderCircle data-spin />}
                  {step.status === "pending" && <Circle />}
                </span>
                {step.label}
              </li>
            ))}
          </ul>
          {message ? <p className={styles.message} data-failed={phase === "failed"}>{message}</p> : null}
        </div>
      ) : null}
      {disabledReason ? <p className={styles.reason}>{disabledReason}</p> : null}
      <form className={styles.form} onSubmit={(event) => void send(event)}>
        <input
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Peça ao Hermes para editar ${target}`}
          aria-label={`Pedir à IA para editar ${target}`}
          maxLength={4000}
          disabled={disabled}
          autoComplete="off"
        />
        {speech.supported && !text.trim() ? (
          <button
            type="button"
            className={styles.mic}
            data-listening={speech.listening}
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={disabled}
            aria-label={speech.listening ? "Parar de ouvir" : "Ditar o pedido"}
          >
            {speech.listening ? <Square aria-hidden /> : <Mic aria-hidden />}
          </button>
        ) : (
          <button type="submit" className={styles.send} disabled={disabled || !text.trim()} aria-label="Enviar pedido">
            {busy ? <LoaderCircle aria-hidden data-spin /> : <ArrowUp aria-hidden />}
          </button>
        )}
      </form>
    </section>
  );
}
