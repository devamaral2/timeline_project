"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { ApiRequestError } from "@/lib/api/client-request";
import { deleteEvent } from "@/lib/api/events";
import { cn } from "@/lib/utils";
import {
  destructiveButtonClass,
  iconButtonClass,
  outlineButtonClass,
} from "@/components/ui/button-styles";
import { dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";

interface DeleteEventDialogProps {
  eventId: string;
  eventName: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteEventDialog({ eventId, eventName, onClose, onDeleted }: DeleteEventDialogProps) {
  const [deleting, setDeleting] = useState(false);
  /** O evento já não existe: a tela avisa e o único botão é voltar, como no caminho de sucesso. */
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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
      await deleteEvent(eventId);

      onDeleted();
      onClose();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "not_found") {
        setGone(true);
        setError("Este evento já não existe. Ele foi apagado em outro lugar.");
      } else {
        setError("Não foi possível excluir o evento. Tente novamente.");
      }
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-event-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ") && !deleting) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className={cn(dialogPanelClass, "max-w-sm overflow-y-auto p-5 sm:p-6")}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle aria-hidden className="size-4.5" />
            </span>
            <h2 id="delete-event-title" className={dialogTitleClass}>
              Excluir evento
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="Fechar"
            className={iconButtonClass}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">
          Tem certeza que deseja excluir{" "}
          <span className="font-medium text-foreground">&ldquo;{eventName}&rdquo;</span>? Essa ação não
          pode ser desfeita.
        </p>

        {error ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          {gone ? (
            <button type="button" onClick={onDeleted} className={outlineButtonClass}>
              Voltar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className={outlineButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className={destructiveButtonClass}
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
