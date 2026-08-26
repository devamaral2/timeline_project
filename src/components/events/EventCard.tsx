"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";
import { formatTime } from "@/lib/timeline/format-date";
import { cn } from "@/lib/utils";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventModal } from "./EditEventModal";
import { EventDetailsModal } from "./EventDetailsModal";
import { typeIcons, typeStyles } from "./event-visuals";

interface EventCardProps {
  event: TimelineEventCardDto;
}

export function EventCard({ event }: EventCardProps) {
  const [viewingDetails, setViewingDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const Icon = typeIcons[event.type];
  const styles = typeStyles[event.type];
  const isRunning = !event.finishedAt;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <CardContent
        event={event}
        styles={styles}
        Icon={Icon}
        isRunning={isRunning}
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
  styles: { icon: string; iconBg: string; bar: string };
  Icon: LucideIcon;
  isRunning: boolean;
  onOpenDetails: () => void;
}

function CardContent({ event, styles, Icon, isRunning, onOpenDetails }: CardContentProps) {
  return (
    <article
      className={cn(
        "relative w-full overflow-hidden rounded-xl border bg-card p-3.5 shadow-card transition-all duration-200 sm:p-4",
        isRunning ? "border-primary/40" : "border-border",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", styles.bar)} />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", styles.iconBg)}>
            <Icon aria-hidden className={cn("size-4", styles.icon)} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-semibold leading-5 text-card-foreground">
              <button
                type="button"
                onClick={onOpenDetails}
                className="block w-full truncate rounded text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {event.name}
              </button>
            </h3>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <p className="flex items-center justify-end gap-2 text-[11.5px] font-medium leading-4 text-muted-foreground">
            {isRunning ? (
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            ) : null}
            <span>
              {formatTime(event.startedAt)} <span aria-hidden>→</span>
              <span className="sr-only">até</span>{" "}
              {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
            </span>
          </p>
          <p className="text-[10.5px] font-medium text-muted-foreground/80">{event.durationLabel}</p>
        </div>
      </div>

      {event.tags.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5 pl-2">
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
    </article>
  );
}
