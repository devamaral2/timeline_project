"use client";

import { useRef, useState } from "react";
import type { EventDto } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { ApiRequestError } from "@/lib/api/client-request";
import { createEvent, newIdempotencyKey, updateEvent } from "@/lib/api/events";
import { buildCreateEventInput, buildEventPatch, type EventDraftErrors, validateEventDraft } from "./event-draft";
import { EventEditHeaderFields } from "./EventEditHeaderFields";
import { EventEditInfoSection } from "./EventEditInfoSection";
import { EventEditReminderSection } from "./EventEditReminderSection";
import { EventEditTagSection } from "./EventEditTagSection";
import { useEventDraft } from "./use-event-draft";
import styles from "./event-edit.module.css";

interface EventEditViewProps {
  /** O evento lido. Sem ele, o formulário é de criação: começa vazio e cria um evento novo. */
  event?: EventDto;
  /** O título de um evento novo, vindo de `/evento comprar pão`. */
  initialName?: string;
  /** Relê o evento depois de uma revisão velha. Não lança. */
  onReload?: () => Promise<void>;
  /** Volta para a tela de onde a pessoa veio, depois de salvar ou de descartar. */
  onLeave: () => void;
}

const STALE_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo.";
const REFUSED_MESSAGE = "A API recusou alguma entrada. Confira os campos e tente de novo.";
const FAILED_MESSAGE = "Não foi possível salvar o evento. Tente novamente.";
const CREATE_FAILED_MESSAGE = "Não foi possível criar o evento. Tente novamente.";

/**
 * O formulário do evento de pessoa, na edição e na criação: uma coluna de
 * seções, com o estado num só lugar (`useEventDraft`). Cada seção lê e escreve
 * os seus campos. Os próximos tickets acrescentam as deles no corpo do
 * formulário, antes do rodapé, e os campos delas no `EventDraft` e em
 * `buildEventPatch` (e em `buildCreateEventInput`, se a criação os enviar).
 */
export function EventEditView({ event: loaded, initialName, onReload, onLeave }: EventEditViewProps) {
  const { event, draft, setField } = useEventDraft(loaded ?? null, initialName);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A criação usa a mesma chave enquanto o formulário estiver aberto: tocar em Salvar de novo não cria outro evento.
  const [idempotencyKey] = useState(newIdempotencyKey);
  // A guarda vale antes da próxima renderização: dois toques seguidos não mandam duas requisições.
  const busy = useRef(false);

  async function save() {
    if (busy.current) return;
    const problems = validateEventDraft(draft);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const patch = event ? buildEventPatch(event, draft, new Date()) : null;
    if (event && !patch) {
      onLeave();
      return;
    }

    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      if (event && patch) await updateEvent(event.id, patch);
      else await createEvent(buildCreateEventInput(draft, new Date()), { idempotencyKey });
      window.dispatchEvent(new Event(agendaRefreshEvent));
      onLeave();
    } catch (cause) {
      busy.current = false;
      setSaving(false);
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await onReload?.();
        setFailure(STALE_MESSAGE);
      } else {
        setFailure(failureMessage(cause, event !== null));
      }
    }
  }

  return (
    <DetailFrame
      type={draft.kind}
      leadLabel="Resumo do evento"
      bodyLabel="Conteúdo do evento"
      lead={
        <header className={styles.head}>
          <p className={styles.eyebrow}>Evento</p>
          <h1 className={styles.title}>{event ? "Editar evento" : "Novo evento"}</h1>
          <EventEditHeaderFields draft={draft} errors={errors} longRunning={event?.longRunning ?? false} onChange={setField} />
        </header>
      }
    >
      <form
        className={styles.form}
        aria-label="Campos do evento"
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          void save();
        }}
      >
        <EventEditInfoSection draft={draft} errors={errors} longRunning={event?.longRunning ?? false} onChange={setField} />
        <EventEditReminderSection draft={draft} onChange={setField} />
        <EventEditTagSection draft={draft} onChange={setField} />
        {/* 26: tarefa persistente. 27: subtarefas. 28: bloqueios.
            29 e 30: artefatos. 31: recorrência. Cada um entra aqui como uma seção nova. */}
        {failure ? <DetailMessage alert>{failure}</DetailMessage> : null}
        <footer className={styles.footer}>
          <button type="button" className={styles.discard} onClick={onLeave}>Descartar</button>
          <button type="submit" className={styles.save} disabled={saving}>Salvar</button>
        </footer>
      </form>
    </DetailFrame>
  );
}

/** A recusa da API vira a mensagem de entrada; o resto, a geral de quem edita ou de quem cria. */
function failureMessage(cause: unknown, editing: boolean): string {
  if (cause instanceof ApiRequestError && cause.kind === "invalid_input") return REFUSED_MESSAGE;
  return editing ? FAILED_MESSAGE : CREATE_FAILED_MESSAGE;
}
