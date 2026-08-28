"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import { AlertTriangle, X } from "lucide-react";
import { getClientApp } from "@/lib/firebase/client-app";
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
      const auth = getAuth(getClientApp());
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("not-authenticated");
      const token = await currentUser.getIdToken();

      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      onDeleted();
      onClose();
    } catch {
      setError("Não foi possível excluir o evento. Tente novamente.");
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className={dialogOverlayClass}
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-event-title"
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

        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-3">
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
