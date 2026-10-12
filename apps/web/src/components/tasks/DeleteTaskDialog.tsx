"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { destructiveButtonClass, outlineButtonClass } from "@/components/ui/button-styles";
import { dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";
import { deleteTask } from "@/lib/tasks/task-api";
import { cn } from "@/lib/utils";

interface DeleteTaskDialogProps {
  taskId: string;
  taskName: string;
  /** Quantas subtarefas vao junto: apagar a tarefa apaga a arvore inteira. */
  subtaskCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteTaskDialog({ taskId, taskName, subtaskCount, onClose, onDeleted }: DeleteTaskDialogProps) {
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
      await deleteTask(taskId);
      onDeleted();
    } catch {
      setError("Não foi possível excluir a tarefa. Tente novamente.");
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
            <h2 id={titleId} className={dialogTitleClass}>Excluir tarefa</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            “{taskName}” será excluída
            {subtaskCount > 0 ? `, junto com ${subtaskCount === 1 ? "a subtarefa" : `as ${subtaskCount} subtarefas`}` : ""}.
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
