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
  anyDecimalStep,
  fieldInputClass,
  fieldLabelClass,
  fromDatetimeLocalValue,
  itemsPatchedWith,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

export function SleepEditForm({
  event,
  item,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps<ItemOfType<"sleep">>) {
  const [trackedSleepTime, setTrackedSleepTime] = useState(String(item.data.trackedSleepTime));
  const [score, setScore] = useState(String(item.data.score));
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const [missed, setMissed] = useState<boolean | undefined>(event.missed);
  const [priority, setPriority] = useState<EventPriority | undefined>(event.priority);
  const { submit, submitting, error } = useSubmitEventUpdate({
    eventId: event.id,
    onUpdated,
    onClose,
  });

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    void submit({
      expectedRevision: event.revision,
      // O campo vazio vira zero, e nao `undefined`: o item de sono guarda dois
      // numeros, e o registro recusa qualquer outra coisa no lugar deles.
      items: itemsPatchedWith(event, item.id, {
        trackedSleepTime: Number(trackedSleepTime) || 0,
        score: Number(score) || 0,
      }),
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sleep-edit-hours" className={fieldLabelClass}>
            Horas dormidas
          </label>
          <input
            id="sleep-edit-hours"
            type="number"
            autoFocus
            min={0}
            max={24}
            step={anyDecimalStep}
            value={trackedSleepTime}
            onChange={(inputEvent) => setTrackedSleepTime(inputEvent.target.value)}
            className={fieldInputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sleep-edit-score" className={fieldLabelClass}>
            Qualidade (0-100)
          </label>
          <input
            id="sleep-edit-score"
            type="number"
            min={0}
            max={100}
            step={anyDecimalStep}
            value={score}
            onChange={(inputEvent) => setScore(inputEvent.target.value)}
            className={fieldInputClass}
          />
        </div>
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

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

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
