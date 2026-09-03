"use client";

import { useState, type FormEvent } from "react";
import {
  CommonFields,
  type EventFormProps,
  FormActions,
  fieldLabelClass,
  fieldTextareaClass,
  useSubmitEvent,
} from "./shared";

export function MealForm({ onBack, onClose, onCreated }: EventFormProps) {
  const [inputText, setInputText] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { submit, submitting, error } = useSubmitEvent({ onCreated, onClose });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!inputText.trim()) {
      setValidationError("Descreva o que você comeu.");
      return;
    }
    setValidationError(null);

    // Um item de refeicao, e nada de `type` no evento: o evento nao tem tipo —
    // tem itens, e e o item que diz o que ele e. Com um item so, ele e o
    // principal sem precisar dizer.
    void submit({
      items: [{ type: "meal", data: { inputText: inputText.trim() } }],
      description: description.trim() || undefined,
      tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="meal-input-text" className={fieldLabelClass}>
          O que você comeu? <span aria-hidden className="text-destructive">*</span>
        </label>
        <textarea
          id="meal-input-text"
          autoFocus
          required
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder="Ex.: 2 ovos mexidos, 1 fatia de pão integral e um café com leite"
          rows={3}
          className={fieldTextareaClass}
        />
        <p className="text-[11.5px] text-muted-foreground">
          Descreva livremente a refeição — os alimentos e valores nutricionais são calculados
          automaticamente.
        </p>
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
