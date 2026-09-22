"use client";

import { TagInput } from "./TagInput";
import { fieldLabelClass, fieldTextareaClass } from "./field-styles";
import { outlineButtonClass, primaryButtonClass } from "@/components/ui/button-styles";

export { anyDecimalStep, fieldInputClass, fieldLabelClass, fieldTextareaClass } from "./field-styles";

interface CommonFieldsProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function CommonFields({ description, onDescriptionChange, tags, onTagsChange }: CommonFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-description" className={fieldLabelClass}>
          Descrição
        </label>
        <textarea
          id="event-description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Detalhes opcionais sobre o evento"
          rows={2}
          className={fieldTextareaClass}
        />
      </div>

      <TagInput tags={tags} onTagsChange={onTagsChange} />
    </>
  );
}

interface FormActionsProps {
  onBack: () => void;
  submitting: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  backLabel?: string;
}

export function FormActions({
  onBack,
  submitting,
  submitLabel = "Criar evento",
  submittingLabel = "Criando...",
  backLabel = "Voltar",
}: FormActionsProps) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className={outlineButtonClass}
      >
        {backLabel}
      </button>
      <button
        type="submit"
        disabled={submitting}
        className={primaryButtonClass}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
