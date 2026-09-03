"use client";

import { useState, type FormEvent } from "react";
import type { EventPriority } from "@repo/entities/contracts";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  type ItemOfType,
  StartedAtField,
  EventMarks,
  fieldInputClass,
  fieldLabelClass,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

/**
 * O item de rotina nao tem payload — `data` e um objeto vazio, e o registro de
 * itens recusa qualquer campo dentro dele. Por isso este e o unico formulario
 * que nao manda `items`: nao ha nada de item para trocar, e reenviar a lista
 * inteira so reescreveria linhas identicas no banco.
 */
export function RoutineEditForm({
  event,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps<ItemOfType<"routine">>) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const [missed, setMissed] = useState<boolean | undefined>(event.missed);
  const [priority, setPriority] = useState<EventPriority | undefined>(event.priority);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { submit, submitting, error } = useSubmitEventUpdate({
    eventId: event.id,
    onUpdated,
    onClose,
  });

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) {
      setValidationError("Dê um nome para o evento.");
      return;
    }
    setValidationError(null);

    void submit({
      expectedRevision: event.revision,
      name: name.trim(),
      description: description.trim(),
      tags,
      startedAt: fromDatetimeLocalValue(startedAt),
      finishedAt: fromDatetimeLocalValue(finishedAt),
      missed,
      priority,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-edit-name" className={fieldLabelClass}>
          Nome <span aria-hidden className="text-destructive">*</span>
        </label>
        <input
          id="routine-edit-name"
          type="text"
          autoFocus
          required
          value={name}
          onChange={(nameEvent) => setName(nameEvent.target.value)}
          className={fieldInputClass}
        />
      </div>

      <CommonFields
        description={description}
        onDescriptionChange={setDescription}
        tags={tags}
        onTagsChange={setTags}
      />

      <StartedAtField value={startedAt} onChange={setStartedAt} />
      <FinishedAtField value={finishedAt} onChange={setFinishedAt} />

      <EventMarks
        missed={missed}
        onMissedChange={setMissed}
        priority={priority}
        onPriorityChange={setPriority}
      />

      {validationError || error ? (
        <p className="text-xs text-destructive">{validationError ?? error}</p>
      ) : null}

      <FormActions
        onBack={onCancel}
        submitting={submitting}
        submitLabel="Salvar alterações"
        submittingLabel="Salvando..."
        backLabel="Cancelar"
      />
    </form>
  );
}
