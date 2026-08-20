"use client";

import { useState, type FormEvent } from "react";
import type { EventDetailDto } from "@/models/events/application/dtos/event-detail.dto";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  StartedAtField,
  fieldInputClass,
  fieldLabelClass,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

type SleepEventDetail = Extract<EventDetailDto, { type: "sleep" }>;

export function SleepEditForm({ eventId, event, onCancel, onClose, onUpdated }: EditEventFormProps<SleepEventDetail>) {
  const [trackedSleepTime, setTrackedSleepTime] = useState(String(event.data.trackedSleepTime));
  const [score, setScore] = useState(String(event.data.score));
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const { submit, submitting, error } = useSubmitEventUpdate({ eventId, onUpdated, onClose });

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    void submit({
      data: {
        trackedSleepTime: trackedSleepTime ? Number(trackedSleepTime) : undefined,
        score: score ? Number(score) : undefined,
      },
      description: description.trim(),
      tags,
      startedAt: fromDatetimeLocalValue(startedAt),
      finishedAt: fromDatetimeLocalValue(finishedAt),
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
            step={0.5}
            value={trackedSleepTime}
            onChange={(event) => setTrackedSleepTime(event.target.value)}
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
            value={score}
            onChange={(event) => setScore(event.target.value)}
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
