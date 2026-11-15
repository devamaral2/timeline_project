"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
import type { EventDraft, EventDraftField } from "./event-draft";
import { addReminder, removeReminder, reminderLabel, reminderMinutes, type ReminderUnit } from "./event-reminders-tags";
import styles from "./event-edit-lists.module.css";

interface EventEditReminderSectionProps {
  draft: EventDraft;
  /** A tarefa persistente sem previsão de entrega: não há aviso, então não se adiciona lembrete. */
  noDeadline?: boolean;
  /** A recusa de `validateEventDraft` para os lembretes que já estão na lista. */
  error?: string;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

const RANGE_MESSAGE = "Use de 1 minuto a 30 dias.";
const NO_DEADLINE_HINT = "Sem previsão de entrega não há lembrete.";

/**
 * "Lembrar antes de": um cartão por lembrete, com remover, e um "Adicionar" que
 * abre a quantidade e a unidade (minutos ou dias). Fora de 1 minuto a 30 dias,
 * o campo avisa e não entra na lista. Sem prazo, o "Adicionar" some.
 */
export function EventEditReminderSection({ draft, noDeadline = false, error: refusal, onChange }: EventEditReminderSectionProps) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<ReminderUnit>("minutes");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setAdding(false);
    setAmount("");
    setUnit("minutes");
    setError(null);
  }

  function add() {
    const minutes = reminderMinutes(Number(amount), unit);
    if (minutes === null) {
      setError(RANGE_MESSAGE);
      return;
    }
    onChange("reminders", addReminder(draft.reminders, minutes));
    close();
  }

  return (
    <DetailSection title="Lembrar antes de" labelId="event-edit-reminders">
      {draft.reminders.length ? (
        <ul className={styles.chips} aria-label="Lembretes">
          {draft.reminders.map((minutes) => {
            const label = reminderLabel(minutes);
            return (
              <li key={minutes}>
                <button
                  type="button"
                  className={styles.chip}
                  aria-label={`Remover lembrete de ${label} antes`}
                  onClick={() => onChange("reminders", removeReminder(draft.reminders, minutes))}
                >
                  <span>{label}</span>
                  <X {...detailIcon} className={styles.chipIcon} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {noDeadline ? (
        <p className={styles.hint}>{NO_DEADLINE_HINT}</p>
      ) : adding ? (
        // Não é um <form>: a edição já é um, e formulário dentro de formulário é HTML inválido.
        <div className={styles.adder} role="group" aria-label="Novo lembrete">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Quantidade do lembrete"
            aria-describedby={error ? "event-reminder-error" : undefined}
            aria-invalid={error ? true : undefined}
            className={`${styles.input} ${styles.amount}`}
            value={amount}
            onChange={(change) => {
              setAmount(change.target.value);
              setError(null);
            }}
            onKeyDown={(key) => {
              if (key.key !== "Enter") return;
              key.preventDefault();
              add();
            }}
          />
          <select
            aria-label="Unidade do lembrete"
            className={styles.input}
            value={unit}
            onChange={(change) => setUnit(change.target.value as ReminderUnit)}
          >
            <option value="minutes">minutos</option>
            <option value="days">dias</option>
          </select>
          <button type="button" className={styles.confirm} onClick={add}>Adicionar</button>
          <button type="button" className={styles.cancel} onClick={close}>Cancelar</button>
          {error ? <p id="event-reminder-error" className={styles.error}>{error}</p> : null}
        </div>
      ) : (
        <button type="button" className={styles.add} aria-label="Adicionar lembrete" onClick={() => setAdding(true)}>
          <Plus {...detailIcon} />
        </button>
      )}
      {refusal ? <p className={styles.error}>{refusal}</p> : null}
    </DetailSection>
  );
}
