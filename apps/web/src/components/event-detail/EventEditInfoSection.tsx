"use client";

import { DetailSection } from "@/components/detail/detail-parts";
import type { EventDraft, EventDraftErrors, EventDraftField } from "./event-draft";
import { EditField } from "./EditField";
import styles from "./event-edit.module.css";

interface EventEditInfoSectionProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/**
 * A seção "Informações" da edição: início, o fim (ou a previsão de entrega, no
 * evento longo), e a descrição. Data e hora são campos separados; data vazia
 * tira a data do evento, e hora vazia com data é o dia inteiro.
 */
export function EventEditInfoSection({ draft, errors, onChange }: EventEditInfoSectionProps) {
  const end = draft.longRunning
    ? { legend: "Previsão de entrega", date: "Data da previsão de entrega", time: "Hora da previsão de entrega" }
    : { legend: "Término", date: "Data de término", time: "Hora de término" };

  return (
    <DetailSection title="Informações" labelId="event-edit-info">
      <div className={styles.details}>
        <fieldset className={styles.when}>
          <legend className={styles.legend}>Início</legend>
          <EditField id="event-start-date" label="Data de início" error={errors.startDate}>
            <input
              id="event-start-date"
              type="date"
              className={styles.input}
              value={draft.startDate}
              aria-describedby={errors.startDate ? "event-start-date-error" : undefined}
              onChange={(change) => onChange("startDate", change.target.value)}
            />
          </EditField>
          <EditField id="event-start-time" label="Hora de início" error={errors.startTime}>
            <input
              id="event-start-time"
              type="time"
              className={styles.input}
              value={draft.startTime}
              aria-describedby={errors.startTime ? "event-start-time-error" : undefined}
              onChange={(change) => onChange("startTime", change.target.value)}
            />
          </EditField>
        </fieldset>

        <fieldset className={styles.when}>
          <legend className={styles.legend}>{end.legend}</legend>
          <EditField id="event-end-date" label={end.date} error={errors.endDate}>
            <input
              id="event-end-date"
              type="date"
              className={styles.input}
              value={draft.endDate}
              aria-describedby={errors.endDate ? "event-end-date-error" : undefined}
              onChange={(change) => onChange("endDate", change.target.value)}
            />
          </EditField>
          <EditField id="event-end-time" label={end.time} error={errors.endTime}>
            <input
              id="event-end-time"
              type="time"
              className={styles.input}
              value={draft.endTime}
              aria-describedby={errors.endTime ? "event-end-time-error" : undefined}
              onChange={(change) => onChange("endTime", change.target.value)}
            />
          </EditField>
        </fieldset>

        <EditField id="event-description" label="Descrição">
          <textarea
            id="event-description"
            className={`${styles.input} ${styles.textarea}`}
            value={draft.description}
            onChange={(change) => onChange("description", change.target.value)}
          />
        </EditField>
      </div>
    </DetailSection>
  );
}
