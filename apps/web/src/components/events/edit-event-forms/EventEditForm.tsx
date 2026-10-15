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
import { LinkNotesField } from "./LinkNotesField";

/**
 * A edicao manual de qualquer evento: os campos dele e a associacao de notes
 * que ja existem. Nao edita o conteudo de nenhuma note. So manda `notes` quando
 * o usuario escolheu alguma; a lista inteira vai com as atuais so pelo `id`,
 * o que as mantem no evento sem reescreve-las.
 */
export function EventEditForm({
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
  const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([]);
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
      ...(linkedNoteIds.length
        ? { notes: [...event.notes.map((note) => ({ id: note.id })), ...linkedNoteIds.map((id) => ({ id }))] }
        : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-edit-name" className={fieldLabelClass}>
          Nome <span aria-hidden className="text-destructive">*</span>
        </label>
        <input
          id="event-edit-name"
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

      <LinkNotesField event={event} selectedIds={linkedNoteIds} onChange={setLinkedNoteIds} />

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
