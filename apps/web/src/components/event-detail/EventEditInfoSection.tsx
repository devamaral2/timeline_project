"use client";

import type { ReactNode } from "react";
import { DetailSection } from "@/components/detail/detail-parts";
import { EditRow, editStyles as edit } from "@/components/edit/edit-parts";
import { DatePicker, TimePicker } from "@/components/edit/pickers";
import type { EventDraft, EventDraftErrors, EventDraftField } from "./event-draft";

interface EventEditInfoSectionProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
  /** As outras linhas da seção: tarefa persistente, recorrência e lembretes. */
  children?: ReactNode;
}

/**
 * A seção "Informações" da edição: uma linha por dado, com o rótulo à esquerda
 * e o controle à direita. Aqui ficam o início e o fim (ou a previsão de
 * entrega, no evento longo); as outras linhas entram por `children`. Data e
 * hora são campos separados; data vazia tira a data do evento, e hora vazia
 * com data é o dia inteiro.
 */
export function EventEditInfoSection({ draft, errors, onChange, children }: EventEditInfoSectionProps) {
  const end = draft.longRunning
    ? { legend: "Previsão de entrega", date: "Data da previsão de entrega", time: "Hora da previsão de entrega" }
    : { legend: "Término", date: "Data de término", time: "Hora de término" };

  return (
    <DetailSection title="Informações" labelId="event-edit-info">
      <div className={edit.rows}>
        <EditRow label="Início">
          <div className={edit.rowControls}>
            <DatePicker
              id="event-start-date"
              label="Data de início"
              value={draft.startDate}
              invalid={Boolean(errors.startDate)}
              describedBy={errors.startDate ? "event-start-date-error" : undefined}
              onChange={(next) => onChange("startDate", next)}
            />
            <TimePicker
              id="event-start-time"
              label="Hora de início"
              value={draft.startTime}
              invalid={Boolean(errors.startTime)}
              describedBy={errors.startTime ? "event-start-time-error" : undefined}
              onChange={(next) => onChange("startTime", next)}
            />
          </div>
          {errors.startDate ? <p id="event-start-date-error" className={edit.error}>{errors.startDate}</p> : null}
          {errors.startTime ? <p id="event-start-time-error" className={edit.error}>{errors.startTime}</p> : null}
        </EditRow>

        <EditRow label={end.legend}>
          <div className={edit.rowControls}>
            <DatePicker
              id="event-end-date"
              label={end.date}
              value={draft.endDate}
              invalid={Boolean(errors.endDate)}
              describedBy={errors.endDate ? "event-end-date-error" : undefined}
              onChange={(next) => onChange("endDate", next)}
            />
            <TimePicker
              id="event-end-time"
              label={end.time}
              value={draft.endTime}
              invalid={Boolean(errors.endTime)}
              describedBy={errors.endTime ? "event-end-time-error" : undefined}
              onChange={(next) => onChange("endTime", next)}
            />
          </div>
          {errors.endDate ? <p id="event-end-date-error" className={edit.error}>{errors.endDate}</p> : null}
          {errors.endTime ? <p id="event-end-time-error" className={edit.error}>{errors.endTime}</p> : null}
        </EditRow>

        {children}
      </div>
    </DetailSection>
  );
}
