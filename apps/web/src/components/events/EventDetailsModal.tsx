"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { formatTime } from "@repo/timeline";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { authedFetch } from "@/lib/api/authed-fetch";
import type {
  EventDetailDto,
  EventItemDto,
  MealItem,
  SleepItem,
  TrainingData,
} from "@repo/entities/contracts";
import { priorityLabels, visualForItemType } from "./event-visuals";
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

/**
 * O item que da a cara ao evento.
 *
 * Ele e encontrado pelo `primaryItemId`, e nao pela primeira posicao do array:
 * a ordem dos itens e a que o usuario montou, e ser o principal e uma escolha a
 * parte. Num evento composto as duas divergem, e ler pela ordem mostraria o
 * item errado.
 */
export function primaryItemOf(event: EventDetailDto): EventItemDto | undefined {
  return event.items.find((item) => item.id === event.primaryItemId);
}

export function EventDetailsModal({
  eventId,
  eventName,
  onClose,
  onEdit,
  onDelete,
}: EventDetailsModalProps) {
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
            <EventDetailsBody event={event} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando evento...</p>
          )}
        </div>

        <div className={dialogFooterClass}>
          <button type="button" onClick={onEdit} className={outlineButtonClass}>
            <Pencil aria-hidden className="size-4" />
            Editar
          </button>
          <button type="button" onClick={onDelete} className={destructiveButtonClass}>
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
  const primaryItem = primaryItemOf(event);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {visualForItemType(primaryItem?.type ?? "").label}
          </span>
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

      {/*
        Todos os itens, na ordem em que o usuario os montou. Um evento composto
        — o treino que tambem registrou a refeicao de depois — guarda mais de um,
        e mostrar so o principal deixaria o resto sem lugar nenhum onde aparecer.
      */}
      {event.items.map((item) => (
        <ItemDetails key={item.id} item={item} />
      ))}

      {event.interruptions.length ? (
        <div>
          <SectionTitle>Interrupções</SectionTitle>
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
                {interruption.description ? (
                  <p className="mt-0.5">{interruption.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ItemDetails({ item }: { item: EventItemDto }) {
  switch (item.type) {
    case "sleep":
      return <SleepDetails data={item.data} />;
    case "training":
      return <TrainingDetails data={item.data} />;
    case "meal":
      return <MealDetails data={item.data} />;
    case "routine":
      // Rotina nao tem payload: o nome e o horario, la em cima, sao tudo.
      return null;
    default:
      // Um tipo que este frontend ainda nao conhece. O que e comum a todo evento
      // ja esta desenhado; desenhar o payload seria adivinhar o formato dele.
      return null;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

function SleepDetails({ data }: { data: SleepItem }) {
  return (
    <div>
      <SectionTitle>Sono</SectionTitle>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Tempo monitorado: {data.trackedSleepTime} min · Pontuação: {data.score}
      </p>
    </div>
  );
}

function TrainingDetails({ data }: { data: TrainingData }) {
  if (!data.workouts.length) return null;

  return (
    <div>
      <SectionTitle>Treinos</SectionTitle>
      <ul className="mt-1.5 space-y-1.5">
        {data.workouts.map((workout) => (
          <li
            key={workout.id}
            className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
          >
            <span className="min-w-0 truncate">{workout.workoutName}</span>
            <span className="shrink-0 tabular-nums">
              {workout.duration} min · {workout.calories} kcal
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MealDetails({ data }: { data: MealItem }) {
  if (!data.foodItems.length) return null;

  return (
    <div>
      <SectionTitle>Alimentos</SectionTitle>
      <ul className="mt-1.5 space-y-1.5">
        {data.foodItems.map((foodItem) => (
          <li
            key={foodItem.id}
            className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
          >
            <span className="min-w-0 truncate">
              {foodItem.name} <span className="text-muted-foreground/70">({foodItem.portion})</span>
            </span>
            <span className="shrink-0 tabular-nums">{foodItem.caloriesKcal} kcal</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12.5px] tabular-nums text-muted-foreground/80">
        {data.totals.totalCaloriesKcal} kcal · {data.totals.totalProteinGrams} g de proteína ·{" "}
        {data.totals.totalCarbohydrateGrams} g de carboidrato · {data.totals.totalFatGrams} g de
        gordura
      </p>
    </div>
  );
}
