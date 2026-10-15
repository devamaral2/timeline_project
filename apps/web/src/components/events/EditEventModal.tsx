"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EventDetailDto } from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { primaryNoteOf } from "./EventDetailsModal";
import { RoutineEditForm } from "./edit-event-forms/RoutineEditForm";
import { SleepEditForm } from "./edit-event-forms/SleepEditForm";
import { TrainingEditForm } from "./edit-event-forms/TrainingEditForm";
import { MealEditForm } from "./edit-event-forms/MealEditForm";
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
 * O formulario e escolhido pelo `kind` do evento, e a note que ele edita e a
 * primeira daquele tipo. As outras notes seguem intactas no PATCH: cada tela
 * edita uma por vez. Um evento sem a note do seu tipo ainda abre o formulario
 * dele — salvar cria a note.
 */
function EditForm({ event, onCancel, onClose, onUpdated }: EditFormRouterProps) {
  const note = primaryNoteOf(event);
  const props = { event, onCancel, onClose, onUpdated };
  if (hasPendingMeal(event.notes)) return <p role="status">{pendingMealEditMessage}</p>;

  switch (event.kind) {
    case "routine":
      return <RoutineEditForm {...props} />;
    case "sleep":
      return <SleepEditForm {...props} note={note?.type === "sleep" ? note : undefined} />;
    case "training":
      return <TrainingEditForm {...props} note={note?.type === "training" ? note : undefined} />;
    case "meal":
      return <MealEditForm {...props} note={note?.type === "meal" ? note : undefined} />;
    default:
      // Uma natureza que este frontend ainda nao conhece. Editar as tripas dela
      // as cegas estragaria o payload; melhor dizer que nao da e deixar o dado
      // como esta.
      return (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Este tipo de evento ainda não pode ser editado por aqui.
        </p>
      );
  }
}
