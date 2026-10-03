"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { cn } from "@/lib/utils";
import { destructiveButtonClass, outlineButtonClass } from "@/components/ui/button-styles";
import { dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";

interface DeleteNoteDialogProps {
  noteId: string;
  noteName: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteNoteDialog({ noteId, noteName, onClose, onDeleted }: DeleteNoteDialogProps) {
  const titleId = useId();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, deleting]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await authedFetch(`/api/notes/${noteId}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setError("Não foi possível excluir a nota. Tente novamente.");
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(click) => {
        if (click.target === click.currentTarget && !deleting) onClose();
      }}
      onKeyDown={() => {}}
    >
      <div className={cn(dialogPanelClass, "max-w-sm")}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden className="size-5 text-destructive" />
            <h2 id={titleId} className={dialogTitleClass}>Excluir nota</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            “{noteName}” será excluída e não poderá ser recuperada.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={deleting} className={outlineButtonClass}>Cancelar</button>
            <button type="button" onClick={() => void handleDelete()} disabled={deleting} className={destructiveButtonClass}>
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
