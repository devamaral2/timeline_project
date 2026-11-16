"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { AddButton, EditRow, EditSelect, editStyles as edit } from "@/components/edit/edit-parts";
import type { TaskDraft, TaskDraftField } from "./task-draft";
import { addReminder, removeReminder, reminderLabel, reminderMinutes, type ReminderUnit } from "./task-reminders-tags";

interface TaskEditReminderSectionProps {
  draft: TaskDraft;
  /** A tarefa persistente sem previsão de entrega: não há aviso, então não se adiciona lembrete. */
  noDeadline?: boolean;
  /** A recusa de `validateTaskDraft` para os lembretes que já estão na lista. */
  error?: string;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

const UNITS: { value: ReminderUnit; label: string }[] = [
  { value: "minutes", label: "minutos" },
  { value: "days", label: "dias" },
];
const RANGE_MESSAGE = "Use de 1 minuto a 30 dias.";
const NO_DEADLINE_HINT = "Sem previsão de entrega não há lembrete.";

/**
 * A linha "Lembrar antes de" de Informações: um chip por lembrete, com remover, e
 * o "+" redondo que abre a quantidade e a unidade (minutos ou dias). Fora de 1
 * minuto a 30 dias, o campo avisa e não entra na lista. Sem prazo, o "+" some.
 */
export function TaskEditReminderSection({ draft, noDeadline = false, error: refusal, onChange }: TaskEditReminderSectionProps) {
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
    <EditRow label="Lembrar antes de" hint={noDeadline ? NO_DEADLINE_HINT : undefined} error={refusal}>
      {draft.reminders.length > 0 || (!noDeadline && !adding) ? (
        <div className={edit.chips}>
          {draft.reminders.length ? (
            <ul aria-label="Lembretes" style={{ display: "contents" }}>
              {draft.reminders.map((minutes) => {
                const label = reminderLabel(minutes);
                return (
                  <li key={minutes} style={{ listStyle: "none" }}>
                    <button
                      type="button"
                      className={edit.chip}
                      aria-label={`Remover lembrete de ${label} antes`}
                      onClick={() => onChange("reminders", removeReminder(draft.reminders, minutes))}
                    >
                      <span>{label}</span>
                      <X className={edit.chipIcon} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {noDeadline || adding ? null : <AddButton label="Adicionar lembrete" onClick={() => setAdding(true)} />}
        </div>
      ) : null}

      {!noDeadline && adding ? (
        // Não é um <form>: a edição já é um, e formulário dentro de formulário é HTML inválido.
        <div className={edit.chips} role="group" aria-label="Novo lembrete">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Quantidade do lembrete"
            aria-describedby={error ? "task-reminder-error" : undefined}
            aria-invalid={error ? true : undefined}
            className={`${edit.control} ${edit.amount}`}
            // Quem tocou no "+" vai digitar a quantidade: o campo já chega com o foco.
            // biome-ignore lint/a11y/noAutofocus: o campo só aparece por ação da pessoa.
            autoFocus
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
          <EditSelect<ReminderUnit>
            label="Unidade do lembrete"
            control
            value={unit}
            options={UNITS}
            onChange={setUnit}
          />
          <div className={edit.rowControls} style={{ flexBasis: "100%" }}>
            <button type="button" className={edit.textAction} data-strong onClick={add}>Adicionar</button>
            <button type="button" className={edit.textAction} onClick={close}>Cancelar</button>
          </div>
          {error ? <p id="task-reminder-error" className={edit.error}>{error}</p> : null}
        </div>
      ) : null}
    </EditRow>
  );
}
