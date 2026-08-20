"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";
import { formatTime } from "@/lib/timeline/format-date";
import { cn } from "@/lib/utils";
import { typeIcons, typeStyles } from "./event-visuals";

interface EventCardProps {
  event: TimelineEventCardDto;
  defaultExpanded?: boolean;
}

export function EventCard({ event, defaultExpanded = false }: EventCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = typeIcons[event.type];
  const styles = typeStyles[event.type];
  const detailsId = `details-${event.id}`;
  const isRunning = !event.finishedAt;
  const hasDetails = Boolean(event.description || event.interruptions.length);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-3.5 shadow-card transition-all duration-200 sm:p-4",
        "hover:-translate-y-0.5 hover:shadow-card-hover",
        isRunning ? "border-primary/40" : "border-border",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", styles.bar)} />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 pl-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", styles.iconBg)}
          >
            <Icon aria-hidden className={cn("size-4", styles.icon)} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold leading-6 text-card-foreground">
              {event.name}
            </h3>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <p className="flex items-center justify-end gap-2 text-[12.5px] font-medium leading-5 text-muted-foreground">
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
          <p className="text-[11px] font-medium text-muted-foreground/80">{event.durationLabel}</p>
        </div>
      </div>

      {event.tags.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5 pl-2">
          {event.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground"
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
            className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Descrição
                  </h4>
                  <p className="mt-1.5 text-[13.5px] leading-6 text-card-foreground">
                    {event.description}
                  </p>
                </div>
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
