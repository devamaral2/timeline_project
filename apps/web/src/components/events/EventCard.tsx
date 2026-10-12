"use client";

import { useState } from "react";
import type { TimelineEventCardDto } from "@/lib/api/contracts";
import {
  elapsedSecondsOf,
  eventPositionOf,
  type EventPosition,
  formatStopwatch,
  formatTime,
} from "@repo/timeline";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/events/use-now";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventModal } from "./EditEventModal";
import { EventDetailsModal } from "./EventDetailsModal";
import { durationPartsOf } from "./duration-parts";
import { ICON_STROKE_WIDTH, missedLabel, visualForItemType, type ItemTypeVisual } from "./event-visuals";

interface EventCardProps {
  event: TimelineEventCardDto;
}

export function EventCard({ event }: EventCardProps) {
  const [viewingDetails, setViewingDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const visual = visualForItemType(event.kind);

  // Sem `overflow-hidden` no wrapper: o halo e o levantar do cartao no hover
  // precisam escapar da caixa. Quem corta e o proprio <article>.
  return (
    <div className="relative">
      <CardContent
        event={event}
        visual={visual}
        onOpenDetails={() => setViewingDetails(true)}
      />

      {viewingDetails ? (
        <EventDetailsModal
          eventId={event.id}
          eventName={event.name}
          onClose={() => setViewingDetails(false)}
          onEdit={() => {
            setViewingDetails(false);
            setEditing(true);
          }}
          onDelete={() => {
            setViewingDetails(false);
            setDeleting(true);
          }}
        />
      ) : null}

      {editing ? (
        <EditEventModal
          eventId={event.id}
          onClose={() => setEditing(false)}
          onUpdated={() => window.location.reload()}
        />
      ) : null}

      {deleting ? (
        <DeleteEventDialog
          eventId={event.id}
          eventName={event.name}
          onClose={() => setDeleting(false)}
          onDeleted={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}

interface CardContentProps {
  event: TimelineEventCardDto;
  visual: ItemTypeVisual;
  onOpenDetails: () => void;
}

function CardContent({ event, visual: { Icon, label, text }, onOpenDetails }: CardContentProps) {
  const now = useNow();
  // Null ate a hidratacao: sem relogio nao da para saber se um evento sem fim
  // declarado esta correndo agora ou e um compromisso de amanha.
  const position: EventPosition | null = now ? eventPositionOf(event, now) : null;
  const running = position === "running";
  const elapsedSeconds = running && now ? elapsedSecondsOf(event.startedAt, now) : null;
  const durationParts = event.finishedAt ? durationPartsOf(event.startedAt, event.finishedAt) : [];
  const hasTags = event.tags.length > 0 || Boolean(event.missed);

  // Quem ja passou some para o fundo: sem superficie. O nao realizado esmaece
  // mais um pouco. O que esta rolando ganha a borda da marca com um aro.
  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-[14px] border transition-colors duration-200",
        running
          ? "border-brand bg-card shadow-[0_0_0_1px_var(--brand)]"
          : position === "past"
            ? "border-card-border bg-transparent"
            : "border-card-border bg-card hover:border-brand/40",
        event.missed && "opacity-[0.58]",
      )}
    >
      <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-4 sm:gap-x-5 sm:px-[22px] sm:py-[18px]">
        <Icon
          aria-hidden
          strokeWidth={ICON_STROKE_WIDTH}
          className={cn("col-start-1 row-span-2 mt-0.5 size-[22px] shrink-0 self-start", text)}
        />

        <span className="sr-only">{label}</span>

        <h3 className="col-start-2 truncate text-[15px] font-semibold leading-[1.4] text-card-foreground">
          <button
            type="button"
            onClick={onOpenDetails}
            className="block w-full truncate rounded text-left transition-colors hover:text-brand-accent focus-visible:text-brand-accent focus-visible:outline-none"
          >
            {event.name}
          </button>
        </h3>

        <div className="col-start-3 row-span-2 justify-self-end">
          {elapsedSeconds !== null ? (
            <span
              role="timer"
              aria-label={`Em andamento ha ${formatStopwatch(elapsedSeconds)}`}
              className="font-mono text-[20px] font-medium tracking-[-0.02em] tabular-nums text-brand sm:text-[22px]"
            >
              {formatStopwatch(elapsedSeconds)}
            </span>
          ) : durationParts.length ? (
            <span className="inline-flex items-baseline gap-[3px] font-display text-[26px] leading-none tabular-nums text-card-foreground sm:text-[30px]">
              {durationParts.map((part, index) => (
                <span key={part.unit} className={cn("inline-flex items-baseline gap-[3px]", index > 0 && "ml-1.5")}>
                  <span>{part.value}</span>
                  <small className="font-sans text-[11px] text-muted-foreground">{part.unit}</small>
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <p className="col-start-2 mt-1.5 flex items-center gap-2.5 text-[13px] tabular-nums text-muted-foreground">
          {position === "past" ? (
            <span aria-hidden className="size-[5px] rounded-full bg-muted-foreground/80" />
          ) : null}
          {running || !event.finishedAt ? (
            <span>{formatTime(event.startedAt)}</span>
          ) : (
            <span>
              {formatTime(event.startedAt)} <span aria-hidden>—</span>
              <span className="sr-only">até</span> {formatTime(event.finishedAt)}
            </span>
          )}
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand">
              <span aria-hidden className="size-1.5 rounded-full bg-brand shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_22%,transparent)]" />
              Em andamento
            </span>
          ) : null}
          {!running && !event.finishedAt && position !== null ? (
            <span className="text-[12px]">sem hora de fim</span>
          ) : null}
        </p>

        {hasTags ? (
          <ul className="col-span-2 col-start-2 mt-3 flex flex-wrap items-center gap-2">
            {event.tags.map((tag) => (
              <li
                key={tag}
                style={tagColorStyle(tag)}
                className="rounded-[5px] px-2 py-[3px] text-[11.5px] font-medium leading-[1.3]"
              >
                #{tag}
              </li>
            ))}
            {event.missed ? (
              <li className="rounded-[5px] bg-destructive/12 px-[7px] dark:bg-destructive/15 py-1 text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.08em] text-destructive">
                {missedLabel}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
