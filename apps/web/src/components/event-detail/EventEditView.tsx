"use client";

import { useState } from "react";
import type { EventDto } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { ApiRequestError } from "@/lib/api/client-request";
import { updateEvent } from "@/lib/api/events";
import { buildEventPatch, type EventDraftErrors, validateEventDraft } from "./event-draft";
import { EventEditHeaderFields } from "./EventEditHeaderFields";
import { EventEditInfoSection } from "./EventEditInfoSection";
import { EventEditReminderSection } from "./EventEditReminderSection";
import { EventEditTagSection } from "./EventEditTagSection";
import { useEventDraft } from "./use-event-draft";
import styles from "./event-edit.module.css";

interface EventEditViewProps {
  event: EventDto;
  /** Relê o evento depois de uma revisão velha. Não lança. */
  onReload: () => Promise<void>;
  /** Volta para a leitura, depois de salvar ou de descartar. */
  onLeave: () => void;
}

const STALE_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo.";
const REFUSED_MESSAGE = "A API recusou alguma entrada. Confira os campos e tente de novo.";
const FAILED_MESSAGE = "Não foi possível salvar o evento. Tente novamente.";

/**
 * O modo de edição do evento de pessoa: uma coluna de seções, com o estado num
 * só lugar (`useEventDraft`). Cada seção lê e escreve os seus campos. Os
 * próximos tickets acrescentam as deles no corpo do formulário, antes do rodapé,
 * e os campos delas no `EventDraft` e em `buildEventPatch`.
 */
export function EventEditView({ event: loaded, onReload, onLeave }: EventEditViewProps) {
  const { event, draft, setField } = useEventDraft(loaded);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    const problems = validateEventDraft(draft);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const patch = buildEventPatch(event, draft, new Date());
    if (!patch) {
      onLeave();
      return;
    }

    setSaving(true);
    setFailure(null);
    try {
      await updateEvent(event.id, patch);
      window.dispatchEvent(new Event(agendaRefreshEvent));
      onLeave();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await onReload();
        setFailure(STALE_MESSAGE);
      } else if (cause instanceof ApiRequestError && cause.kind === "invalid_input") {
        setFailure(REFUSED_MESSAGE);
      } else {
        setFailure(FAILED_MESSAGE);
      }
    } finally {
      setSaving(false);
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
          <h1 className={styles.title}>Editar evento</h1>
          <EventEditHeaderFields draft={draft} errors={errors} longRunning={event.longRunning} onChange={setField} />
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
        <EventEditInfoSection draft={draft} errors={errors} longRunning={event.longRunning} onChange={setField} />
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
