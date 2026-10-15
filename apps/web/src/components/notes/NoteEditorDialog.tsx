"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { CreateNoteRequest, NoteDto, UpdateNoteRequest } from "@/lib/api/contracts";
import { iconButtonClass } from "@/components/ui/button-styles";
import { dialogHeaderClass, dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";
import { cn } from "@/lib/utils";
import { fieldInputClass, fieldLabelClass } from "@/components/events/new-event-forms/field-styles";
import { FormActions } from "@/components/events/new-event-forms/shared";
import { TagInput } from "@/components/events/new-event-forms/TagInput";
import { MarkdownEditor, type MarkdownEditorMode } from "./MarkdownEditor";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";

interface NoteEditorDialogProps {
  /** Ausente, o dialogo cria uma nota solta; presente, edita essa. */
  note?: NoteDto;
  onClose: () => void;
  /** Chamado depois que a API aceitou. Recebe o id da nota criada, quando for o caso. */
  onSaved: (noteId?: string) => void;
}

export function NoteEditorDialog({ note, onClose, onSaved }: NoteEditorDialogProps) {
  const titleId = useId();
  const [name, setName] = useState(note?.name ?? "");
  // So a nota de texto tem um corpo a editar; refeicao, sono e treino so mudam titulo e tags aqui.
  const editsBody = !note || note.type === "text";
  const [content, setContent] = useState(note?.type === "text" ? note.data.body : "");
  const [tags, setTags] = useState(note?.tags ?? []);
  const [mode, setMode] = useState<MarkdownEditorMode>("write");
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingMeal = hasPendingMeal(note ? [note] : []);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pendingMeal) return;
    if (editsBody && !content.trim()) {
      setError("Escreva o texto da nota.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (note) {
        const common = { expectedRevision: note.revision, name: name.trim() || undefined, tags };
        const body: UpdateNoteRequest = editsBody ? { ...common, type: "text", data: { body: content } } : common;
        await authedFetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        onSaved();
      } else {
        const body: CreateNoteRequest = { type: "text", data: { body: content }, name: name.trim() || undefined, tags };
        const { noteId } = await authedFetch<{ noteId: string }>("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        onSaved(noteId);
      }
    } catch {
      setError("Não foi possível salvar a nota. Tente novamente.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(click) => {
        if (click.target === click.currentTarget && !submitting) onClose();
      }}
      onKeyDown={() => {}}
    >
      <div className={cn(dialogPanelClass, mode === "split" ? "max-w-4xl" : "max-w-2xl")}>
        <div className={dialogHeaderClass}>
          <h2 id={titleId} className={dialogTitleClass}>{note ? "Editar nota" : "Nova nota"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className={iconButtonClass}>
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {pendingMeal ? <p role="status" className="px-5 py-5">{pendingMealEditMessage}</p> :
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${titleId}-name`} className={fieldLabelClass}>Título</label>
            <input
              id={`${titleId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Opcional — vem da primeira linha"
              className={fieldInputClass}
            />
          </div>
          {editsBody ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${titleId}-content`} className={fieldLabelClass}>Texto</label>
            <MarkdownEditor
              id={`${titleId}-content`}
              value={content}
              onChange={setContent}
              mode={mode}
              onModeChange={setMode}
              placeholder={"Escreva em markdown: ## subtítulo, **negrito**, - lista, - [ ] tarefa, > citação."}
              textareaRef={contentRef}
            />
          </div>
          ) : null}
          <TagInput tags={tags} onTagsChange={setTags} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <FormActions
            onBack={onClose}
            backLabel="Cancelar"
            submitting={submitting}
            submitLabel={note ? "Salvar" : "Criar nota"}
            submittingLabel="Salvando..."
          />
        </form>}
      </div>
    </div>,
    document.body,
  );
}
