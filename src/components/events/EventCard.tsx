"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Pencil, Trash2, type LucideIcon } from "lucide-react";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";
import { formatTime } from "@/lib/timeline/format-date";
import { cn } from "@/lib/utils";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventModal } from "./EditEventModal";
import { typeIcons, typeStyles } from "./event-visuals";

interface EventCardProps {
  event: TimelineEventCardDto;
  defaultExpanded?: boolean;
}

export function EventCard({ event, defaultExpanded = false }: EventCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const Icon = typeIcons[event.type];
  const styles = typeStyles[event.type];
  const detailsId = `details-${event.id}`;
  const isRunning = !event.finishedAt;
  const hasDetails = Boolean(event.description || event.interruptions.length);

  function closeActions() {
    setRevealed(false);
    scrollerRef.current?.scrollTo?.({ left: 0, behavior: "smooth" });
  }

  // No mouse (telas de computador) nao ha gesto de swipe, entao o painel de
  // acoes e revelado por clique em vez de scroll horizontal — evita tambem
  // conflitar com o scroll horizontal dos dias no layout desktop.
  function toggleActionsByClick() {
    if (revealed) {
      closeActions();
      return;
    }
    setRevealed(true);
    const scroller = scrollerRef.current;
    scroller?.scrollTo?.({ left: scroller.scrollWidth - scroller.clientWidth, behavior: "smooth" });
  }

  function openEdit() {
    setEditing(true);
    closeActions();
  }

  function openDelete() {
    setDeleting(true);
    closeActions();
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        ref={scrollerRef}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto lg:snap-none lg:overflow-x-hidden"
      >
        <CardContent
          event={event}
          styles={styles}
          Icon={Icon}
          isRunning={isRunning}
          detailsId={detailsId}
          hasDetails={hasDetails}
          expanded={expanded}
          setExpanded={setExpanded}
          onRevealActions={toggleActionsByClick}
          revealed={revealed}
        />

        <div className="flex w-16 shrink-0 snap-end flex-col">
          <button
            type="button"
            onClick={openEdit}
            aria-label={`Editar ${event.name}`}
            className="grid h-1/2 place-items-center bg-accent text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
          >
            <Pencil aria-hidden className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={openDelete}
            aria-label={`Excluir ${event.name}`}
            className="grid h-1/2 place-items-center bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
          >
            <Trash2 aria-hidden className="size-4.5" />
          </button>
        </div>
      </div>

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
  detailsId: string;
  hasDetails: boolean;
  expanded: boolean;
  setExpanded: (value: (current: boolean) => boolean) => void;
  onRevealActions: () => void;
  revealed: boolean;
}

function CardContent({
  event,
  styles,
  Icon,
  isRunning,
  detailsId,
  hasDetails,
  expanded,
  setExpanded,
  onRevealActions,
  revealed,
}: CardContentProps) {
  return (
    <article
      className={cn(
        "group relative w-full shrink-0 snap-start overflow-hidden rounded-xl border bg-card p-3.5 shadow-card transition-all duration-200 sm:p-4",
        isRunning ? "border-primary/40" : "border-border",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", styles.bar)} />

      {/* So aparece em telas de computador: nao ha gesto de swipe com mouse,
          entao o acesso as acoes de editar/excluir e por clique aqui. */}
      <button
        type="button"
        onClick={onRevealActions}
        aria-label={revealed ? "Ocultar ações" : "Mostrar ações"}
        aria-expanded={revealed}
        className="absolute inset-y-0 right-0 z-10 hidden w-6 items-center justify-center text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 lg:flex"
      >
        <ChevronLeft aria-hidden className={cn("size-4 transition-transform duration-200", revealed && "rotate-180")} />
      </button>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", styles.iconBg)}>
            <Icon aria-hidden className={cn("size-4", styles.icon)} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold leading-5 text-card-foreground">
              {event.name}
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

      {hasDetails ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="mt-2 flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? "Ocultar detalhes" : "Ver detalhes"}
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>

          {expanded ? (
            <div
              id={detailsId}
              className="mt-1 space-y-4 border-t border-border pl-2 pt-3 duration-200 animate-in fade-in slide-in-from-top-1"
            >
              {event.description ? (
                <p className="text-[13.5px] leading-6 text-card-foreground">{event.description}</p>
              ) : null}

              {event.interruptions.length ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Interrupções
                  </h4>
                  <ul className="mt-1.5 space-y-1.5">
                    {event.interruptions.map((interruption, index) => (
                      <li
                        key={`${interruption.name}-${index}`}
                        className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground"
                      >
                        <span className="min-w-0 truncate">{interruption.name}</span>
                        <span className="shrink-0 tabular-nums">{interruption.durationLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
