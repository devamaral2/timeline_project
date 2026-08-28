"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";
import { TagInput } from "./TagInput";
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

  async function submit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);

    try {
      const auth = getAuth(getClientApp());
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("not-authenticated");
      const token = await currentUser.getIdToken();

      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      onCreated();
      onClose();
    } catch {
      setError("Não foi possível criar o evento. Tente novamente.");
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
