"use client";

import type { RequestEditEntityType } from "@repo/contracts";
import { ArrowUp, Check, Circle, LoaderCircle, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { ModelPickerScrim, useModelPicker } from "@/components/hub/model-picker";
import { HermesComposer } from "@/components/ui/hermes-composer";
import { useModelSelection } from "@/lib/agent-chat/model-selection-store";
import { armChangeFlash } from "@/lib/motion/change-flash";
import { useHermesDock } from "@/components/ui/hermes-flight";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { runningStepLabel } from "@/lib/tasks/agent-request-model";
import { EDIT_TARGET_LABELS } from "@/lib/entity-edit/entity-edit-target";
import { useEntityAiEdit } from "@/lib/entity-edit/use-entity-ai-edit";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import styles from "./entity-ai-edit-bar.module.css";

/** O registro aberto, como o campo o mostra: o ícone do tipo, "Tarefa · sex., 18 set., 09:00" e o nome. */
export interface EntityAiEditContext {
  icon: ReactNode;
  meta: string;
  title: string;
}

interface EntityAiEditBarProps {
  userId: string;
  entityType: RequestEditEntityType;
  entityId: string;
  /** A edicao terminou e mudou algo: a tela recarrega a entidade. */
  onEdited: () => void;
  /** Desliga o campo com o motivo (por exemplo, a refeicao ainda esta sendo gerada). */
  disabledReason?: string;
  /** O registro que o pedido edita, mostrado dentro do campo. */
  context?: EntityAiEditContext;
  pollMs?: number;
}

/**
 * O campo de conversa com a IA no pe das telas de detalhe (ADR 0006): o que se escreve edita a entidade aberta.
 * O pedido de edicao leva o tipo e o id da entidade; o servidor escolhe o agente e confere o tipo.
 *
 * O pe do campo mostra sempre o modelo, o esforco e o provedor que vao atender o pedido, e tocar nele abre o painel
 * da escolha, mesmo com um pedido em andamento (a troca vale para o proximo). A escolha e a mesma do chat.
 */
export function EntityAiEditBar({ userId, entityType, entityId, onEdited, disabledReason, context, pollMs }: EntityAiEditBarProps) {
  const [text, setText] = useState("");
  // No celular, o botão do Hermes da barra inferior pousa no status deste campo.
  const barRef = useRef<HTMLElement>(null);
  useHermesDock(barRef);
  // O que mudar na recarga depois da edição se anuncia na tela (`useChangeFlash`).
  const edited = useCallback(() => { armChangeFlash(); onEdited?.(); }, [onEdited]);
  const { phase, request, error, submit, dismiss, busy } = useEntityAiEdit({ userId, entityType, entityId, onEdited: edited, pollMs });
  const picker = useModelPicker(useModelSelection());
  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
  });
  const target = EDIT_TARGET_LABELS[entityType];
  const disabled = busy || Boolean(disabledReason);

  async function send() {
    if (disabled || !text.trim()) return;
    const request = text;
    setText("");
    const accepted = await submit(request);
    if (!accepted) setText(request);
  }

  /** Enter envia; Shift+Enter quebra a linha. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  const steps = request?.steps ?? [];
  const message = phase === "failed" ? error : request?.message;
  const state: HermesState = speech.listening ? "listening" : phase === "sending" || phase === "running" ? "thinking" : phase === "done" ? "done" : phase === "failed" ? "error" : "idle";
  const statusText = speech.listening ? "Ouvindo…"
    : phase === "done" ? "Pronto"
    : phase === "failed" ? "Não deu certo"
    : phase === "sending" || phase === "running" ? (request?.progress ?? (request ? runningStepLabel(request) : undefined) ?? "Entendendo o pedido…")
    : "Esperando o seu pedido";
  return (
    <section ref={barRef} className={styles.bar} data-entity-ai-bar data-model-lifted={picker.lifted || undefined} aria-label={`Editar ${target} com IA`}>
      <ModelPickerScrim picker={picker} fixed />
      {steps.length > 0 || message ? (
        <div className={styles.result} data-phase={phase}>
          {steps.length > 0 ? (
            <ul className={styles.steps} aria-label="Passos do pedido">
              {steps.map((step) => (
                <li key={step.id} data-status={step.status}>
                  <span className={styles.mark} aria-hidden>
                    {step.status === "done" && <Check />}
                    {(step.status === "failed" || step.status === "cancel") && <X />}
                    {step.status === "running" && <LoaderCircle data-spin />}
                    {(step.status === "queued" || step.status === "waiting") && <Circle />}
                  </span>
                  {step.label}
                </li>
              ))}
            </ul>
          ) : null}
          {message ? <p className={styles.message} data-failed={phase === "failed"}>{message}</p> : null}
        </div>
      ) : null}
      {disabledReason ? <p className={styles.reason}>{disabledReason}</p> : null}
      <p className={styles.status} data-state={state} role="status" aria-live="polite">
        <HermesMark state={state} />
        <span>{statusText}</span>
        {phase === "done" || phase === "failed" ? (
          <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fechar resultado"><X aria-hidden /></button>
        ) : null}
      </p>
      <HermesComposer
        model={picker}
        onSubmit={() => void send()}
        context={context ? (
          <div className={styles.context}>
            <span className={styles.contextIcon} aria-hidden>{context.icon}</span>
            <span className={styles.contextText}><span>{context.meta}</span><span>{context.title}</span></span>
          </div>
        ) : null}
        controls={(
          <>
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
            <button type="submit" className={styles.send} disabled={disabled || !text.trim()} aria-label={busy ? "Aguardando a resposta" : "Enviar pedido"}>
              <ArrowUp aria-hidden />
            </button>
          </>
        )}
      >
        <textarea
          className={styles.input}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Peça uma mudança n${target}`}
          aria-label={`Pedir à IA para editar ${target}`}
          maxLength={4000}
          disabled={disabled}
          autoComplete="off"
        />
      </HermesComposer>
    </section>
  );
}
