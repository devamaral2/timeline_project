"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import { X } from "lucide-react";
import { getClientApp } from "@/lib/firebase/client-app";
import type { EventDetailDto } from "@/models/events/application/dtos/event-detail.dto";
import { RoutineEditForm } from "./edit-event-forms/RoutineEditForm";
import { SleepEditForm } from "./edit-event-forms/SleepEditForm";
import { TrainingEditForm } from "./edit-event-forms/TrainingEditForm";
import { FoodEditForm } from "./edit-event-forms/FoodEditForm";

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
        const auth = getAuth(getClientApp());
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("not-authenticated");
        const token = await currentUser.getIdToken();

        const response = await fetch(`/api/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const data = (await response.json()) as EventDetailDto;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200 animate-in fade-in"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-event-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-card-hover duration-200 animate-in fade-in slide-in-from-bottom-2 sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="edit-event-title" className="text-lg font-semibold tracking-tight text-foreground">
            Editar evento
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">Não foi possível carregar o evento. Tente novamente.</p>
        ) : event ? (
          <EditForm event={event} onCancel={onClose} onClose={onClose} onUpdated={onUpdated} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando evento...</p>
        )}
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

function EditForm({ event, onCancel, onClose, onUpdated }: EditFormRouterProps) {
  switch (event.type) {
    case "routine":
      return (
        <RoutineEditForm
          eventId={event.id}
          event={event}
          onCancel={onCancel}
          onClose={onClose}
          onUpdated={onUpdated}
        />
      );
    case "sleep":
      return (
        <SleepEditForm
          eventId={event.id}
          event={event}
          onCancel={onCancel}
          onClose={onClose}
          onUpdated={onUpdated}
        />
      );
    case "training":
      return (
        <TrainingEditForm
          eventId={event.id}
          event={event}
          onCancel={onCancel}
          onClose={onClose}
          onUpdated={onUpdated}
        />
      );
    case "food":
      return (
        <FoodEditForm
          eventId={event.id}
          event={event}
          onCancel={onCancel}
          onClose={onClose}
          onUpdated={onUpdated}
        />
      );
  }
}
