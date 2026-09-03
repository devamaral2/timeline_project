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

export function RoutineForm({ onBack, onClose, onCreated }: EventFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { submit, submitting, error } = useSubmitEvent({ onCreated, onClose });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setValidationError("Dê um nome para o evento.");
      return;
    }
    setValidationError(null);

    // O item de rotina nao tem payload — o que existe e o nome do evento.
    void submit({
      items: [{ type: "routine" }],
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-name" className={fieldLabelClass}>
          Nome <span aria-hidden className="text-destructive">*</span>
        </label>
        <input
          id="routine-name"
          type="text"
          autoFocus
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Estudar inglês"
          className={fieldInputClass}
        />
      </div>

      <CommonFields
        description={description}
        onDescriptionChange={setDescription}
        tags={tags}
        onTagsChange={setTags}
      />

      {validationError || error ? (
        <p className="text-xs text-destructive">{validationError ?? error}</p>
      ) : null}

      <FormActions onBack={onBack} submitting={submitting} />
    </form>
  );
}
