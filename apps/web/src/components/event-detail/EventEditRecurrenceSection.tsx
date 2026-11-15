"use client";

import { type ReactNode, useState } from "react";
import type { EventDto } from "@repo/contracts";
import { shortDate } from "@repo/timeline";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { deleteRecurrence } from "@/lib/api/recurrences";
import { recurrenceRuleLabel } from "@/lib/events/card-text";
import { recurrenceLines } from "@/lib/events/event-read-model";
import { EditField } from "./EditField";
import type { EventDraft } from "./event-draft";
import {
  type RecurrenceDraft,
  type RecurrenceErrors,
  type RecurrenceFrequency,
  browserTimeZone,
  buildRecurrenceRule,
  emptyRecurrenceDraft,
  recurrenceDraftFromRule,
} from "./event-recurrence-draft";
import type { RecurrenceState } from "./use-recurrence-draft";
import editStyles from "./event-edit.module.css";
import styles from "./event-edit-recurrence.module.css";

interface EventEditRecurrenceSectionProps {
  /** O evento lido; `null` na criação. */
  event: EventDto | null;
  /** Início e fim planejado do formulário: a criação tira deles a hora, a duração e o início da regra. */
  draft: EventDraft;
  recurrence: RecurrenceState;
  errors: RecurrenceErrors;
  /** Chamado depois de apagar a série: a tela relê o evento e a agenda se atualiza. */
  onSeriesDeleted: () => void;
}

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: "daily", label: "Todo dia" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
  { value: "yearly", label: "Todo ano" },
];

/** Bit 0 = domingo, como o bitmask da API. */
const WEEKDAYS = [
  { letter: "D", name: "Domingo" },
  { letter: "S", name: "Segunda" },
  { letter: "T", name: "Terça" },
  { letter: "Q", name: "Quarta" },
  { letter: "Q", name: "Quinta" },
  { letter: "S", name: "Sexta" },
  { letter: "S", name: "Sábado" },
];

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * "Recorrência" da edição. Três casos: na criação, a linha permite definir a regra
 * (Salvar cria a série em vez do evento); num evento avulso, só diz que não se
 * repete; numa ocorrência, mostra a regra, desde quando vale, se tem fim e se a
 * ocorrência segue a série, deixa trocar a regra e apagar a série. A regra não
 * entra no corpo do evento: o Salvar da tela a manda como chamada própria.
 */
export function EventEditRecurrenceSection({ event, draft, recurrence, errors, onSeriesDeleted }: EventEditRecurrenceSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const occurrence = event?.recurrence;

  if (event && !occurrence) {
    return (
      <DetailSection title="Recorrência" labelId="event-edit-recurrence">
        <p className={styles.value}>Não se repete</p>
      </DetailSection>
    );
  }

  if (!event) {
    return (
      <DetailSection title="Recorrência" labelId="event-edit-recurrence">
        {recurrence.draft === null ? (
          <div className={styles.row}>
            <p className={styles.value}>Não se repete</p>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                recurrence.setDraft(emptyRecurrenceDraft(draft.startDate));
                setOpen(true);
              }}
            >
              Definir a regra
            </button>
          </div>
        ) : (
          <>
            <RuleBlock
              summary={creationSummary(recurrence.draft, draft)}
              meta={creationMeta(recurrence.draft, draft)}
              open={open}
              onToggle={() => setOpen((current) => !current)}
            >
              {open ? (
                <>
                  <RuleEditor draft={recurrence.draft} errors={errors} onChange={(patch) => recurrence.setDraft((current) => (current ? { ...current, ...patch } : current))} />
                  <p className={styles.hint}>A data de início, a hora e a duração vêm do formulário.</p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => {
                        recurrence.setDraft(null);
                        setOpen(false);
                      }}
                    >
                      Não repetir
                    </button>
                  </div>
                </>
              ) : null}
            </RuleBlock>
            {errors.startDate ? <p className={editStyles.error}>{errors.startDate}</p> : null}
            {errors.startTime ? <p className={editStyles.error}>{errors.startTime}</p> : null}
          </>
        )}
      </DetailSection>
    );
  }

  const series = recurrence.series;
  if (recurrence.loadState === "loading" || (recurrence.loadState === "idle" && !series)) {
    return (
      <DetailSection title="Recorrência" labelId="event-edit-recurrence">
        <DetailMessage>Carregando recorrência…</DetailMessage>
      </DetailSection>
    );
  }
  if (recurrence.loadState === "gone") {
    return (
      <DetailSection title="Recorrência" labelId="event-edit-recurrence">
        <p className={styles.value}>A série já não existe.</p>
      </DetailSection>
    );
  }
  if (recurrence.loadState === "error" || !series || !recurrence.draft || !occurrence) {
    return (
      <DetailSection title="Recorrência" labelId="event-edit-recurrence">
        <DetailMessage alert>Não foi possível carregar a recorrência.</DetailMessage>
      </DetailSection>
    );
  }

  const lines = recurrenceLines(occurrence);
  const seriesId = series.id;

  async function remove() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteRecurrence(seriesId);
      setConfirming(false);
      onSeriesDeleted();
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DetailSection title="Recorrência" labelId="event-edit-recurrence">
      <RuleBlock
        summary={lines.rule}
        meta={lines.detail}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
        {open ? (
          <>
            <RuleEditor draft={recurrence.draft} errors={errors} onChange={(patch) => recurrence.setDraft((current) => (current ? { ...current, ...patch } : current))} />
            <p className={styles.hint}>A hora, a duração e o início da série ficam como estão.</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  recurrence.setDraft(recurrenceDraftFromRule(series));
                  setOpen(false);
                }}
              >
                Cancelar troca
              </button>
            </div>
          </>
        ) : null}
      </RuleBlock>

      {!open && !confirming ? (
        <div className={styles.actions}>
          <button type="button" className={styles.danger} onClick={() => setConfirming(true)}>Apagar a série</button>
        </div>
      ) : null}
      {confirming ? (
        <div role="group" aria-label="Apagar a série" className={styles.confirm}>
          <p className={styles.value}>Apagar a série? Ela deixa de se repetir e não dá para desfazer.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.link} onClick={() => setConfirming(false)}>Cancelar</button>
            <button type="button" className={styles.danger} disabled={deleting} onClick={() => void remove()}>
              Sim, apagar a série
            </button>
          </div>
        </div>
      ) : null}
      {deleteFailed ? <DetailMessage alert>Não foi possível apagar a série. Tente novamente.</DetailMessage> : null}
    </DetailSection>
  );
}

/** A linha da regra: a pílula que abre o editor, e embaixo desde quando vale e se tem fim. */
function RuleBlock({ summary, meta, open, onToggle, children }: {
  summary: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.block}>
      <button
        type="button"
        aria-label={`Recorrência: ${summary}. Trocar`}
        aria-expanded={open}
        className={styles.pill}
        onClick={onToggle}
      >
        <span className={styles.pillText}>{summary}</span>
        <span className={styles.pillHint}>Trocar</span>
      </button>
      <p className={styles.meta}>{meta}</p>
      {children}
    </div>
  );
}

/** O editor da regra, o mesmo na criação e na troca da série. */
function RuleEditor({ draft, errors, onChange }: {
  draft: RecurrenceDraft;
  errors: RecurrenceErrors;
  onChange: (patch: Partial<RecurrenceDraft>) => void;
}) {
  const unit = unitOf(draft.frequency, draft.interval);
  return (
    <div className={styles.editor}>
      <EditField id="recurrence-frequency" label="Frequência">
        <select
          id="recurrence-frequency"
          className={editStyles.input}
          value={draft.frequency}
          onChange={(change) => onChange({ frequency: change.target.value as RecurrenceFrequency })}
        >
          {FREQUENCIES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </EditField>

      <EditField id="recurrence-interval" label="Repetir a cada" error={errors.interval}>
        <div className={styles.intervalRow}>
          <input
            id="recurrence-interval"
            type="number"
            inputMode="numeric"
            min={1}
            className={editStyles.input}
            value={draft.interval}
            aria-describedby={errors.interval ? "recurrence-interval-error" : undefined}
            onChange={(change) => onChange({ interval: Number(change.target.value) })}
          />
          <span className={styles.unit}>{unit}</span>
        </div>
      </EditField>

      {draft.frequency === "weekly" ? (
        <div className={styles.field}>
          <span id="recurrence-weekdays" className={editStyles.label}>Dias da semana</span>
          <div role="group" aria-labelledby="recurrence-weekdays" className={styles.days}>
            {WEEKDAYS.map((day, bit) => {
              const on = (draft.weekdays & (1 << bit)) !== 0;
              return (
                <button
                  key={day.name}
                  type="button"
                  aria-label={day.name}
                  aria-pressed={on}
                  className={styles.day}
                  onClick={() => onChange({ weekdays: draft.weekdays ^ (1 << bit) })}
                >
                  {day.letter}
                </button>
              );
            })}
          </div>
          {errors.weekdays ? <p className={editStyles.error}>{errors.weekdays}</p> : null}
        </div>
      ) : null}

      {draft.frequency === "monthly" || draft.frequency === "yearly" ? (
        <EditField id="recurrence-month-day" label="Dia do mês" error={errors.monthDay}>
          <input
            id="recurrence-month-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            className={editStyles.input}
            value={draft.monthDay}
            onChange={(change) => onChange({ monthDay: Number(change.target.value) })}
          />
        </EditField>
      ) : null}

      {draft.frequency === "yearly" ? (
        <EditField id="recurrence-month" label="Mês">
          <select
            id="recurrence-month"
            className={editStyles.input}
            value={draft.month}
            onChange={(change) => onChange({ month: Number(change.target.value) })}
          >
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
        </EditField>
      ) : null}

      <EditField id="recurrence-ends-on" label="Termina em" error={errors.endsOn}>
        <input
          id="recurrence-ends-on"
          type="date"
          className={editStyles.input}
          value={draft.endsOn}
          aria-describedby={errors.endsOn ? "recurrence-ends-on-error" : undefined}
          onChange={(change) => onChange({ endsOn: change.target.value })}
        />
      </EditField>
      <p className={styles.hint}>Sem data, a série não tem fim.</p>
    </div>
  );
}

function unitOf(frequency: RecurrenceFrequency, interval: number): string {
  const plural = interval !== 1;
  switch (frequency) {
    case "daily":
      return plural ? "dias" : "dia";
    case "weekly":
      return plural ? "semanas" : "semana";
    case "monthly":
      return plural ? "meses" : "mês";
    case "yearly":
      return plural ? "anos" : "ano";
  }
}

/** O resumo da regra na criação, quando o formulário já tem início e hora; antes disso, pede os dois. */
function creationSummary(draft: RecurrenceDraft, form: EventDraft): string {
  if (!form.startDate || !form.startTime) return "Falta a data e a hora de início";
  return recurrenceRuleLabel(buildRecurrenceRule(draft, form, browserTimeZone()));
}

function creationMeta(draft: RecurrenceDraft, form: EventDraft): string {
  const since = form.startDate ? `desde ${shortDate(form.startDate).toLowerCase()}` : "sem data de início";
  const end = draft.endsOn ? `até ${shortDate(draft.endsOn).toLowerCase()}` : "sem fim";
  return `${since} · ${end}`;
}
