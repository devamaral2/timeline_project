"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import { Pencil, Trash2, X } from "lucide-react";
import { getClientApp } from "@/lib/firebase/client-app";
import { formatTime } from "@repo/timeline";
import { tagColorStyle } from "@/lib/tags/tag-color";
import type { EventDetailDto } from "@repo/entities/contracts";
import { priorityLabels, typeLabels } from "./event-visuals";
import { MissedBadge } from "./MissedBadge";
import { cn } from "@/lib/utils";
import {
  destructiveButtonClass,
  iconButtonClass,
  outlineButtonClass,
} from "@/components/ui/button-styles";
import {
  dialogFooterClass,
  dialogHeaderClass,
  dialogOverlayClass,
  dialogPanelClass,
  dialogTitleClass,
} from "@/components/ui/dialog-styles";

interface EventDetailsModalProps {
  eventId: string;
  eventName: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventDetailsModal({ eventId, eventName, onClose, onEdit, onDelete }: EventDetailsModalProps) {
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
      className={dialogOverlayClass}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-details-title"
        className={cn(dialogPanelClass, "max-w-md")}
      >
        <div className={dialogHeaderClass}>
          <h2 id="event-details-title" className={dialogTitleClass}>
            {eventName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={iconButtonClass}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <p className="text-sm text-destructive">Não foi possível carregar o evento. Tente novamente.</p>
          ) : event ? (
            <EventDetailsBody event={event} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando evento...</p>
          )}
        </div>

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onEdit}
            className={outlineButtonClass}
          >
            <Pencil aria-hidden className="size-4" />
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={destructiveButtonClass}
          >
            <Trash2 aria-hidden className="size-4" />
            Excluir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EventDetailsBody({ event }: { event: EventDetailDto }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{typeLabels[event.type]}</span>
          <MissedBadge missed={event.missed} />
        </span>
        <span className="shrink-0">
          {formatTime(event.startedAt)} <span aria-hidden>→</span>{" "}
          {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
        </span>
      </div>

      {/*
        A anotacao de nao realizado ja esta no selo la em cima — repeti-la aqui
        seria dizer duas vezes a mesma coisa. A prioridade nao tem selo, entao e
        esta linha que a mostra.
      */}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
        <div className="flex gap-1.5">
          <dt>Prioridade:</dt>
          <dd className="text-card-foreground">{priorityLabels[event.priority]}</dd>
        </div>
      </dl>

      {event.description ? (
        <p className="text-[13.5px] leading-6 text-card-foreground">{event.description}</p>
      ) : null}

      {event.tags.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {event.tags.map((tag) => (
            <li
              key={tag}
              style={tagColorStyle(tag)}
              className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
            >
              #{tag}
            </li>
          ))}
        </ul>
      ) : null}

      <TypeDetails event={event} />

      {event.interruptions.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interrupções
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {event.interruptions.map((interruption) => (
              <li key={interruption.id} className="text-[13px] text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-card-foreground">
                    {interruption.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatTime(interruption.startedAt)}–{formatTime(interruption.finishedAt)}
                  </span>
                </div>
                {interruption.description ? <p className="mt-0.5">{interruption.description}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TypeDetails({ event }: { event: EventDetailDto }) {
  switch (event.type) {
    case "sleep":
      return (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sono</h4>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Tempo monitorado: {event.data.trackedSleepTime} min · Pontuação: {event.data.score}
          </p>
        </div>
      );
    case "training":
      return event.data.workouts.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Treinos</h4>
          <ul className="mt-1.5 space-y-1.5">
            {event.data.workouts.map((workout, index) => (
              <li
                key={workout.id ?? index}
                className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
              >
                <span className="capitalize">{workout.type}</span>
                <span className="tabular-nums">
                  {workout.duration} min · {workout.calories} kcal
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    case "food":
      return event.data.items.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Alimentos
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {event.data.items.map((item, index) => (
              <li
                key={item.id ?? index}
                className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
              >
                <span className="min-w-0 truncate">
                  {item.food} <span className="text-muted-foreground/70">({item.portion})</span>
                </span>
                <span className="shrink-0 tabular-nums">{item.caloriesKcal} kcal</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    case "routine":
      return null;
  }
}
