"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EventDetailDto } from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { EventEditForm } from "./edit-event-forms/EventEditForm";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";
import { cn } from "@/lib/utils";
import { iconButtonClass } from "@/components/ui/button-styles";
import {
  dialogHeaderClass,
  dialogOverlayClass,
  dialogPanelClass,
  dialogTitleClass,
} from "@/components/ui/dialog-styles";

interface EditEventModalProps {
  eventId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditEventModal({ eventId, onClose, onUpdated }: EditEventModalProps) {
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await authedFetch<EventDetailDto>(`/api/events/${eventId}`);
        if (!cancelled) setEvent(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-event-title"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.target === keyboardEvent.currentTarget && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
          keyboardEvent.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className={cn(dialogPanelClass, "max-w-md")}
      >
        <div className={dialogHeaderClass}>
          <h2 id="edit-event-title" className={dialogTitleClass}>
            Editar evento
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className={iconButtonClass}>
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar o evento. Tente novamente.
            </p>
          ) : event ? (
            <EditForm event={event} onCancel={onClose} onClose={onClose} onUpdated={onUpdated} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando evento...</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface EditFormRouterProps {
  event: EventDetailDto;
  onCancel: () => void;
  onClose: () => void;
  onUpdated: () => void;
}

/**
 * Uma so edicao para todo tipo de evento: os campos dele e a associacao de
 * notes existentes. O conteudo das notes nao se edita por aqui.
 */
function EditForm({ event, onCancel, onClose, onUpdated }: EditFormRouterProps) {
  if (hasPendingMeal(event.notes)) return <p role="status">{pendingMealEditMessage}</p>;
  return <EventEditForm event={event} onCancel={onCancel} onClose={onClose} onUpdated={onUpdated} />;
}
