"use client";

import { isFinalAgentStatus, isOpenAgentStatus, isSuccessAgentStatus } from "@repo/contracts";
import type { RequestEditEntityType } from "@repo/contracts";
import { ArrowUp, Check, Circle, LoaderCircle, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useModelPicker } from "@/components/hub/model-picker";
import { HermesComposer } from "@/components/ui/hermes-composer";
import { useModelSelection } from "@/lib/agent-chat/model-selection-store";
import { armChangeFlash } from "@/lib/motion/change-flash";
import { useHermesDock } from "@/components/ui/hermes-flight";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { HermesMark, type HermesState } from "@/components/ui/hermes-mark";
import { runningStepLabel } from "@/lib/tasks/agent-request-model";
import { EDIT_TARGET_LABELS, isModelCommand } from "@/lib/entity-edit/entity-edit-target";
import { useEntityAiEdit } from "@/lib/entity-edit/use-entity-ai-edit";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import styles from "./entity-ai-edit-bar.module.css";

interface EntityAiEditBarProps {
  userId: string;
  entityType: RequestEditEntityType;
  entityId: string;
  /** A edicao terminou e mudou algo: a tela recarrega a entidade. */
  onEdited: () => void;
  /** Desliga o campo com o motivo (por exemplo, a refeicao ainda esta sendo gerada). */
  disabledReason?: string;
  pollMs?: number;
}

/**
 * O campo de conversa com a IA no pe das telas de detalhe (ADR 0006): o que se escreve edita a entidade aberta.
 * O pedido de edicao leva o tipo e o id da entidade; o servidor escolhe o agente e confere o tipo.
 *
 * O desenho e o do canvas "Input do detalhe da entidade": a linha de status com o robo solto, sem disco nem cor, e a
 * pilula de uma linha (o texto, a onda e a seta), sem nada do modelo a vista. Escrever `/model` e enviar abre a
 * folha da escolha por cima da tela, em vez de virar pedido. A escolha e a mesma do chat e vai em todo
 * pedido. O campo nao repete o registro aberto: a tela ja o mostra.
 */
export function EntityAiEditBar({ userId, entityType, entityId, onEdited, disabledReason, pollMs }: EntityAiEditBarProps) {
  const [text, setText] = useState("");
  // No celular, o botão do Hermes da barra inferior pousa no status deste campo.
  const barRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useHermesDock(barRef);
  // O que mudar na recarga depois da edição se anuncia na tela (`useChangeFlash`).
  const edited = useCallback(() => { armChangeFlash(); onEdited?.(); }, [onEdited]);
  const { phase, request, error, submit, dismiss, busy } = useEntityAiEdit({ userId, entityType, entityId, onEdited: edited, pollMs });
  const picker = useModelPicker(useModelSelection(), { returnFocus: inputRef });
  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => setText((current) => (current ? `${current} ${transcript}` : transcript).slice(0, 4000)),
  });
  const target = EDIT_TARGET_LABELS[entityType];
  const disabled = busy || Boolean(disabledReason);

  async function send() {
    if (disabled || !text.trim()) return;
    // `/model` abre a folha da escolha do modelo, em vez de virar pedido.
    if (picker.choice && isModelCommand(text)) {
      setText("");
      picker.show();
      return;
    }
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
    <section ref={barRef} className={styles.bar} data-entity-ai-bar aria-label={`Editar ${target} com IA`}>
      {steps.length > 0 || message ? (
        <div className={styles.result} data-phase={phase}>
          {steps.length > 0 ? (
            <ul className={styles.steps} aria-label="Passos do pedido">
              {steps.map((step) => (
                <li key={step.id} data-status={step.status}>
                  <span className={styles.mark} aria-hidden>
                    {isSuccessAgentStatus(step.status) && <Check />}
                    {isFinalAgentStatus(step.status) && !isSuccessAgentStatus(step.status) && <X />}
                    {step.status === "running" && <LoaderCircle data-spin />}
                    {isOpenAgentStatus(step.status) && step.status !== "running" && <Circle />}
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
        <HermesMark state={state} plain />
        <span>{statusText}</span>
        {phase === "done" || phase === "failed" ? (
          <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fechar resultado"><X aria-hidden /></button>
        ) : null}
      </p>
      <HermesComposer
        model={picker}
        onSubmit={() => void send()}
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
          ref={inputRef}
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
