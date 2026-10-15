"use client";

import { useEffect, useState } from "react";
import type { EventDetailDto, NoteDto } from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { linkableNotesOf, noteTypeForEventKind, noteTypeLabels } from "@/lib/events/linkable-notes";
import { fieldLabelClass } from "../new-event-forms/field-styles";

interface LinkNotesFieldProps {
  event: EventDetailDto;
  selectedIds: string[];
  onChange: (noteIds: string[]) => void;
}

/**
 * Associa ao evento notes que ja existem. Nao edita nenhuma: so oferece as do
 * tipo adequado ao evento (as de refeicao para o evento de refeicao, e assim
 * por diante) que ainda nao estao nele.
 */
export function LinkNotesField({ event, selectedIds, onChange }: LinkNotesFieldProps) {
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const typeLabel = noteTypeLabels[noteTypeForEventKind(event.kind)];

  useEffect(() => {
    let cancelled = false;
    authedFetch<NoteDto[]>("/api/notes")
      .then((loaded) => {
        if (!cancelled) setNotes(linkableNotesOf(loaded, event));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [event]);

  function toggle(noteId: string, checked: boolean) {
    onChange(checked ? [...selectedIds, noteId] : selectedIds.filter((id) => id !== noteId));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={fieldLabelClass}>Associar nota de {typeLabel}</legend>

      {failed ? (
        <p role="alert" className="text-xs text-destructive">Não foi possível carregar as notas.</p>
      ) : notes === null ? (
        <p role="status" className="text-xs text-muted-foreground">Carregando notas…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma nota de {typeLabel} disponível para associar.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {notes.map((note) => (
            <li key={note.id}>
              <label className="flex items-start gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(note.id)}
                  onChange={(change) => toggle(note.id, change.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  {note.name}
                  {note.tags.length ? (
                    <span className="ml-2 text-xs text-muted-foreground">{note.tags.map((tag) => `#${tag}`).join(" ")}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
