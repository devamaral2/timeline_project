"use client";

import { useState, type FormEvent } from "react";
import {
  CommonFields,
  type EventFormProps,
  FormActions,
  fieldInputClass,
  fieldLabelClass,
  useSubmitEvent,
} from "./shared";

export function SleepForm({ onBack, onClose, onCreated }: EventFormProps) {
  const [trackedSleepTime, setTrackedSleepTime] = useState("");
  const [score, setScore] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const { submit, submitting, error } = useSubmitEvent({ onCreated, onClose });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    void submit({
      type: "sleep",
      data: {
        trackedSleepTime: trackedSleepTime ? Number(trackedSleepTime) : undefined,
        score: score ? Number(score) : undefined,
      },
      description: description.trim() || undefined,
      tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sleep-hours" className={fieldLabelClass}>
            Horas dormidas
          </label>
          <input
            id="sleep-hours"
            type="number"
            autoFocus
            min={0}
            max={24}
            step={0.5}
            value={trackedSleepTime}
            onChange={(event) => setTrackedSleepTime(event.target.value)}
            placeholder="Ex.: 7.5"
            className={fieldInputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sleep-score" className={fieldLabelClass}>
            Qualidade (0-100)
          </label>
          <input
            id="sleep-score"
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(event) => setScore(event.target.value)}
            placeholder="Ex.: 85"
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

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <FormActions onBack={onBack} submitting={submitting} />
    </form>
  );
}
