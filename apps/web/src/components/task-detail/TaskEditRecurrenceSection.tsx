"use client";

import { Repeat } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { shortDate } from "@repo/timeline";
import { DetailMessage } from "@/components/detail/detail-parts";
import { EditRow, EditSelect, editStyles as edit } from "@/components/edit/edit-parts";
import { DatePicker } from "@/components/edit/pickers";
import { deleteRecurrence } from "@/lib/api/recurrences";
import { recurrenceRuleLabel } from "@/lib/tasks/card-text";
import { recurrenceLines } from "@/lib/tasks/task-read-model";
import { EditField } from "./EditField";
import type { TaskDraft } from "./task-draft";
import {
  type RecurrenceDraft,
  type RecurrenceErrors,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
  browserTimeZone,
  buildRecurrenceRule,
  emptyRecurrenceDraft,
  recurrenceDraftFromRule,
  scheduleAfterTask,
} from "./task-recurrence-draft";
import type { RecurrenceState } from "./use-recurrence-draft";
import styles from "./task-edit-recurrence.module.css";

interface TaskEditRecurrenceSectionProps {
  /** O evento lido; `null` na criação. */
  task: TaskDto | null;
  /** Início e fim planejado do formulário: a criação tira deles a hora, a duração e o início da regra. */
  draft: TaskDraft;
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
 * A linha "Recorrência" de Informações. Três casos: na criação, a linha permite definir a regra
 * (Salvar cria a série em vez do evento); num evento avulso, permite o mesmo (Salvar grava o evento
 * e cria a série, que começa no dia seguinte); numa ocorrência, mostra a regra, desde quando vale, se tem fim e se a
 * ocorrência segue a série, deixa trocar a regra e apagar a série. A regra não
 * entra no corpo do evento: o Salvar da tela a manda como chamada própria.
 */
export function TaskEditRecurrenceSection({ task, draft, recurrence, errors, onSeriesDeleted }: TaskEditRecurrenceSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const occurrence = task?.recurrence;

  // Sem série (a criação, ou um evento avulso), a linha deixa definir a regra. No evento avulso a série nasce no dia
  // seguinte ao dele: o evento que já existe fica como está.
  if (!task || !occurrence) {
    const schedule = task ? scheduleAfterTask(draft) : draft;
    return (
      <EditRow label="Recorrência" hint={recurrence.draft === null ? "Não se repete" : undefined}>
        {recurrence.draft === null ? (
          <div className={edit.rowControls}>
            <button
              type="button"
              className={edit.control}
              onClick={() => {
                recurrence.setDraft(emptyRecurrenceDraft(draft.startDate));
                setOpen(true);
              }}
            >
              <Repeat className={edit.icon} aria-hidden />
              <span className={edit.controlText} data-empty>Definir a regra</span>
            </button>
          </div>
        ) : (
          <>
            <RuleBlock
              summary={creationSummary(recurrence.draft, schedule)}
              meta={creationMeta(recurrence.draft, schedule)}
              open={open}
              onToggle={() => setOpen((current) => !current)}
            >
              {open ? (
                <>
                  <RuleEditor draft={recurrence.draft} errors={errors} onChange={(patch) => recurrence.setDraft((current) => (current ? { ...current, ...patch } : current))} />
                  <p className={edit.hint}>
                    {task
                      ? "Este evento fica como está; a série começa no dia seguinte, com a hora e a duração dele."
                      : "A data de início, a hora e a duração vêm do formulário."}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={edit.textAction}
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
            {errors.startDate ? <p className={edit.error}>{errors.startDate}</p> : null}
            {errors.startTime ? <p className={edit.error}>{errors.startTime}</p> : null}
          </>
        )}
      </EditRow>
    );
  }

  const series = recurrence.series;
  if (recurrence.loadState === "loading" || (recurrence.loadState === "idle" && !series)) {
    return (
      <EditRow label="Recorrência">
        <p className={edit.plain} role="status">Carregando recorrência…</p>
      </EditRow>
    );
  }
  if (recurrence.loadState === "gone") {
    return (
      <EditRow label="Recorrência">
        <p className={edit.plain}>A série já não existe.</p>
      </EditRow>
    );
  }
  if (recurrence.loadState === "error" || !series || !recurrence.draft || !occurrence) {
    return (
      <EditRow label="Recorrência">
        <p className={edit.plain} role="alert">Não foi possível carregar a recorrência.</p>
      </EditRow>
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
    <EditRow label="Recorrência">
      <RuleBlock
        summary={lines.rule}
        meta={lines.detail}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
        {open ? (
          <>
            <RuleEditor draft={recurrence.draft} errors={errors} onChange={(patch) => recurrence.setDraft((current) => (current ? { ...current, ...patch } : current))} />
            <p className={edit.hint}>A hora, a duração e o início da série ficam como estão.</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={edit.textAction}
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
          <button type="button" className={edit.textAction} data-danger onClick={() => setConfirming(true)}>Apagar a série</button>
        </div>
      ) : null}
      {confirming ? (
        <div role="group" aria-label="Apagar a série" className={styles.confirm}>
          <p className={styles.confirmText}>Apagar a série? Ela deixa de se repetir e não dá para desfazer.</p>
          <div className={styles.actions}>
            <button type="button" className={edit.textAction} onClick={() => setConfirming(false)}>Cancelar</button>
            <button type="button" className={edit.textAction} data-danger disabled={deleting} onClick={() => void remove()}>
              Sim, apagar a série
            </button>
          </div>
        </div>
      ) : null}
      {deleteFailed ? <DetailMessage alert>Não foi possível apagar a série. Tente novamente.</DetailMessage> : null}
    </EditRow>
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
    <>
      <div className={edit.rowControls}>
        <button
          type="button"
          aria-label={`Recorrência: ${summary}. Trocar`}
          aria-expanded={open}
          className={edit.control}
          onClick={onToggle}
        >
          <Repeat className={edit.icon} aria-hidden />
          <span className={edit.controlText}>{summary}</span>
        </button>
      </div>
      <p className={edit.hint}>{meta}</p>
      {children}
    </>
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
        <EditSelect<RecurrenceFrequency>
          id="recurrence-frequency"
          label="Frequência"
          control
          value={draft.frequency}
          options={FREQUENCIES}
          onChange={(frequency) => onChange({ frequency })}
        />
      </EditField>

      <EditField id="recurrence-interval" label="Repetir a cada" error={errors.interval}>
        <div className={styles.intervalRow}>
          <input
            id="recurrence-interval"
            type="number"
            inputMode="numeric"
            min={1}
            className={edit.control}
            value={draft.interval}
            aria-describedby={errors.interval ? "recurrence-interval-error" : undefined}
            onChange={(change) => onChange({ interval: Number(change.target.value) })}
          />
          <span className={styles.unit}>{unit}</span>
        </div>
      </EditField>

      {draft.frequency === "weekly" ? (
        <div className={styles.field}>
          <span id="recurrence-weekdays" className={styles.label}>Dias da semana</span>
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
          {errors.weekdays ? <p className={edit.error}>{errors.weekdays}</p> : null}
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
            className={edit.control}
            value={draft.monthDay}
            onChange={(change) => onChange({ monthDay: Number(change.target.value) })}
          />
        </EditField>
      ) : null}

      {draft.frequency === "yearly" ? (
        <EditField id="recurrence-month" label="Mês">
          <EditSelect<string>
            id="recurrence-month"
            label="Mês"
            control
            value={String(draft.month)}
            options={MONTHS.map((name, index) => ({ value: String(index + 1), label: name }))}
            onChange={(month) => onChange({ month: Number(month) })}
          />
        </EditField>
      ) : null}

      <EditField id="recurrence-ends-on" label="Termina em" error={errors.endsOn}>
        <DatePicker
          id="recurrence-ends-on"
          label="Termina em"
          placeholder="Sem fim"
          value={draft.endsOn}
          invalid={Boolean(errors.endsOn)}
          describedBy={errors.endsOn ? "recurrence-ends-on-error" : undefined}
          onChange={(endsOn) => onChange({ endsOn })}
        />
      </EditField>
      <p className={edit.hint}>Sem data, a série não tem fim.</p>
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
function creationSummary(draft: RecurrenceDraft, form: RecurrenceSchedule): string {
  if (!form.startDate || !form.startTime) return "Falta a data e a hora de início";
  return recurrenceRuleLabel(buildRecurrenceRule(draft, form, browserTimeZone()));
}

function creationMeta(draft: RecurrenceDraft, form: RecurrenceSchedule): string {
  const since = form.startDate ? `desde ${shortDate(form.startDate).toLowerCase()}` : "sem data de início";
  const end = draft.endsOn ? `até ${shortDate(draft.endsOn).toLowerCase()}` : "sem fim";
  return `${since} · ${end}`;
}
