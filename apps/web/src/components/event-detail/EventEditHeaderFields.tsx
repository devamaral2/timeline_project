"use client";

import type { EventPriority, HumanEventKind, HumanEventStatus } from "@repo/contracts";
import { EditCaret, EditSelect, editStyles as edit } from "@/components/edit/edit-parts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventPriorityMark, eventPriorityLabels } from "@/components/events/event-priority-mark";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import { visualForItemType } from "@/components/events/event-visuals";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import type { EventDraft, EventDraftErrors, EventDraftField } from "./event-draft";

/** Os tipos de evento de pessoa, na ordem do quadro Tipos. */
const KINDS: HumanEventKind[] = ["common", "meal", "sleep", "training"];
/** A prioridade da mais alta para a mais baixa, como no seletor da leitura. */
const PRIORITY_ORDER: EventPriority[] = ["urgent", "high", "medium", "low"];
/** O valor do `<select>` para "sem status": o rascunho guarda `null`. */
const NO_STATUS = "";

interface EventEditHeaderFieldsProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/**
 * O resumo do formulário, como no quadro "Detalhe · edição": a pílula do tipo
 * (ícone e código em mono), o título como campo na serifa, e a linha com o
 * status (glifo, nome e código) e a prioridade (barras e nome). O status
 * "Sem status" vale só para evento que não é longo (o longo sempre tem status).
 * O que vale é o rascunho: a tarefa persistente ligada agora já muda as opções.
 */
export function EventEditHeaderFields({ draft, errors, onChange }: EventEditHeaderFieldsProps) {
  const statuses = humanStatusOptions({ longRunning: draft.longRunning });
  const statusOptions: { value: string; label: string }[] = statuses.map((status) => ({ value: status, label: eventStatusName("human", status) }));
  if (!draft.longRunning) statusOptions.push({ value: NO_STATUS, label: "Sem status" });

  return (
    <div className={edit.summary}>
      <div className={edit.summaryRow}>
        <EditSelect<HumanEventKind>
          id="event-kind"
          label="Tipo"
          pill
          value={draft.kind}
          options={KINDS.map((kind) => ({ value: kind, label: visualForItemType(kind).label }))}
          onChange={(kind) => onChange("kind", kind)}
        >
          <span className={edit.kindBox}><EventKindMark kind={draft.kind} size={16} /></span>
          <EditCaret />
        </EditSelect>
      </div>

      <input
        id="event-name"
        type="text"
        aria-label="Título"
        placeholder="Título do evento"
        autoComplete="off"
        className={edit.titleInput}
        value={draft.name}
        aria-invalid={errors.name ? true : undefined}
        aria-describedby={errors.name ? "event-name-error" : undefined}
        onChange={(change) => onChange("name", change.target.value)}
      />
      {errors.name ? <p id="event-name-error" className={edit.error}>{errors.name}</p> : null}

      <div className={edit.choices}>
        <EditSelect<string>
          id="event-status"
          label="Status"
          value={draft.status ?? NO_STATUS}
          options={statusOptions}
          invalid={Boolean(errors.status)}
          describedBy={errors.status ? "event-status-error" : undefined}
          onChange={(value) => onChange("status", value === NO_STATUS ? null : (value as HumanEventStatus))}
        >
          <span className={edit.statusGlyph}><EventStatusGlyph actor="human" status={draft.status} size={28} /></span>
          <span className={edit.statusText}>
            <span className={`${edit.statusName} ${edit.tone}`} data-tone={draft.status ?? "reference"}>
              {eventStatusName("human", draft.status)}
              <EditCaret />
            </span>
            <span className={edit.statusCode}>{draft.status ?? "sem status"}</span>
          </span>
        </EditSelect>

        <EditSelect<EventPriority>
          id="event-priority"
          label="Prioridade"
          value={draft.priority}
          options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: eventPriorityLabels[priority] }))}
          onChange={(priority) => onChange("priority", priority)}
        >
          <span className={edit.priorityBox}><EventPriorityMark priority={draft.priority} /></span>
          <span className={`${edit.priorityName} ${edit.tone}`} data-tone={draft.priority}>
            {eventPriorityLabels[draft.priority]}
            <EditCaret />
          </span>
        </EditSelect>
      </div>
      {errors.status ? <p id="event-status-error" className={edit.error}>{errors.status}</p> : null}
    </div>
  );
}
