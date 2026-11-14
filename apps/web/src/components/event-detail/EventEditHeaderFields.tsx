"use client";

import type { EventPriority, HumanEventKind, HumanEventStatus } from "@repo/contracts";
import { eventPriorityLabels } from "@/components/events/event-priority-mark";
import { eventStatusName } from "@/components/events/event-status-glyph";
import { visualForItemType } from "@/components/events/event-visuals";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import type { EventDraft, EventDraftErrors, EventDraftField } from "./event-draft";
import { EditField } from "./EditField";
import styles from "./event-edit.module.css";

/** Os tipos de evento de pessoa, na ordem do quadro Tipos. */
const KINDS: HumanEventKind[] = ["routine", "meal", "sleep", "training"];
/** A prioridade da mais alta para a mais baixa, como no seletor da leitura. */
const PRIORITY_ORDER: EventPriority[] = ["urgent", "high", "medium", "low"];

interface EventEditHeaderFieldsProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  longRunning: boolean;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/**
 * Os campos do topo do formulário: tipo, título, status e prioridade. O status
 * "Sem status" vale só para evento que não é longo (o longo sempre tem status).
 */
export function EventEditHeaderFields({ draft, errors, longRunning, onChange }: EventEditHeaderFieldsProps) {
  const statuses = humanStatusOptions({ longRunning });

  return (
    <div className={styles.fields}>
      <EditField id="event-kind" label="Tipo">
        <select id="event-kind" className={styles.input} value={draft.kind} onChange={(change) => onChange("kind", change.target.value as HumanEventKind)}>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>{visualForItemType(kind).label}</option>
          ))}
        </select>
      </EditField>

      <EditField id="event-name" label="Título" error={errors.name}>
        <input
          id="event-name"
          type="text"
          className={styles.input}
          value={draft.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "event-name-error" : undefined}
          onChange={(change) => onChange("name", change.target.value)}
        />
      </EditField>

      <EditField id="event-status" label="Status">
        <select
          id="event-status"
          className={styles.input}
          value={draft.status ?? ""}
          onChange={(change) => onChange("status", change.target.value === "" ? null : (change.target.value as HumanEventStatus))}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>{eventStatusName("human", status)}</option>
          ))}
          {longRunning ? null : <option value="">Sem status</option>}
        </select>
      </EditField>

      <EditField id="event-priority" label="Prioridade">
        <select id="event-priority" className={styles.input} value={draft.priority} onChange={(change) => onChange("priority", change.target.value as EventPriority)}>
          {PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>{eventPriorityLabels[priority]}</option>
          ))}
        </select>
      </EditField>
    </div>
  );
}
