"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";
import { fieldInputClass, fieldLabelClass } from "../new-event-forms/field-styles";

export { CommonFields, FormActions, fieldInputClass, fieldLabelClass, fieldTextareaClass } from "../new-event-forms/shared";
export { TagInput } from "../new-event-forms/TagInput";

interface UseSubmitEventUpdateOptions {
  eventId: string;
  onUpdated: () => void;
  onClose: () => void;
}

/**
 * PATCH so envia os campos que o usuario de fato alterou nesta tela. Campos
 * como type, userId e eventId nunca sao enviados: a rota os ignora (sao
 * imutaveis / vem do proprio recurso) e o merge no backend preserva qualquer
 * coisa que nao seja enviada.
 */
export function useSubmitEventUpdate({ eventId, onUpdated, onClose }: UseSubmitEventUpdateOptions) {
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

      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      onUpdated();
      onClose();
    } catch {
      setError("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}

/** Converte um instante ISO para o valor local esperado por <input type="datetime-local">. */
export function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Converte de volta o valor local do input para um instante ISO em UTC. */
export function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

interface StartedAtFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function StartedAtField({ value, onChange }: StartedAtFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="event-started-at" className={fieldLabelClass}>
        Iniciado em
      </label>
      <input
        id="event-started-at"
        type="datetime-local"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldInputClass}
      />
    </div>
  );
}

interface FinishedAtFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function FinishedAtField({ value, onChange }: FinishedAtFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="event-finished-at" className={fieldLabelClass}>
        Encerrado em
      </label>
      <input
        id="event-finished-at"
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ainda em andamento"
        className={fieldInputClass}
      />
    </div>
  );
}

export interface EditEventFormProps<TData> {
  eventId: string;
  event: TData;
  onCancel: () => void;
  onClose: () => void;
  onUpdated: () => void;
}
