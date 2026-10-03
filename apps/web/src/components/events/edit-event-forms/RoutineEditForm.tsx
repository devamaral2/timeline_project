"use client";

import { useState, type FormEvent } from "react";
import type { EventPriority, NotificationOffsetMinutes } from "@/lib/api/contracts";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  StartedAtField,
  EventMarks,
  NotificationOffsetsField,
  fieldInputClass,
  fieldLabelClass,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

/**
 * A rotina nao tem note propria: so os campos do evento. Por isso este e o unico
 * formulario que nao manda `notes` — as notes do evento (texto livre, por
 * exemplo) continuam como estao, e reenviar a lista so reescreveria vinculos
 * identicos no banco.
 */
export function RoutineEditForm({
  event,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const [missed, setMissed] = useState<boolean | undefined>(event.missed);
  const [priority, setPriority] = useState<EventPriority | undefined>(event.priority);
  const [notifyOffsetsMinutes, setNotifyOffsetsMinutes] = useState<NotificationOffsetMinutes[] | undefined>(
    event.notifyOffsetsMinutes,
  );
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
      notifyOffsetsMinutes,
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
      <NotificationOffsetsField value={notifyOffsetsMinutes} onChange={setNotifyOffsetsMinutes} />

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
