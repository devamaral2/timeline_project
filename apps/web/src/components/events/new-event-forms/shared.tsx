"use client";

import { useState } from "react";
import type { CreateEventInput } from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { TagInput } from "./TagInput";
import { ScheduleError, submissionOf, type ScheduleState } from "./schedule";
import { fieldLabelClass, fieldTextareaClass } from "./field-styles";
import { outlineButtonClass, primaryButtonClass } from "@/components/ui/button-styles";

export { anyDecimalStep, fieldInputClass, fieldLabelClass, fieldTextareaClass } from "./field-styles";

interface UseSubmitEventOptions {
  onCreated: () => void;
  onClose: () => void;
}

export function useSubmitEvent({ onCreated, onClose }: UseSubmitEventOptions) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sem repeticao cria um evento; com repeticao, a serie que o gera. */
  async function submit(payload: CreateEventInput, schedule: ScheduleState) {
    setError(null);
    let submission: ReturnType<typeof submissionOf>;
    try {
      submission = submissionOf(payload, schedule);
    } catch (cause) {
      setError(cause instanceof ScheduleError ? cause.message : "Confira a data do evento.");
      return;
    }

    setSubmitting(true);
    try {
      await authedFetch(submission.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission.body),
      });

      onCreated();
      onClose();
    } catch {
      setError(
        submission.url === "/api/recurrences"
          ? "Não foi possível criar a repetição. Tente novamente."
          : "Não foi possível criar o evento. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}

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

export interface EventFormProps {
  onBack: () => void;
  onClose: () => void;
  onCreated: () => void;
}
