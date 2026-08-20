import { longDate, shortDate, weekday } from "@/lib/timeline/format-date";
import { trackedMinutesOf } from "@/lib/timeline/event-metrics";
import type { TimelineDay } from "@/lib/timeline/timeline-day";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";

interface DayColumnProps {
  day: TimelineDay;
  variant: "vertical" | "column";
}

export function DayColumn({ day, variant }: DayColumnProps) {
  const trackedHours = Math.round(trackedMinutesOf(day.events) / 60);
  const eventLabel = day.events.length === 1 ? "evento" : "eventos";

  return (
    <section
      aria-label={longDate(day.dayKey)}
      className={cn(
        "duration-300 animate-in fade-in",
        variant === "column"
          ? "w-[300px] shrink-0 snap-start slide-in-from-right-4 lg:w-[320px]"
          : "slide-in-from-bottom-2",
      )}
    >
      <header
        className={cn(
          "mb-3 pb-2",
          day.isToday ? "border-b-2 border-primary/60" : "border-b border-border",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[21px] font-bold leading-7 tracking-tight text-foreground">
            {variant === "column" ? shortDate(day.dayKey) : longDate(day.dayKey)}
          </h2>
          {day.isToday ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              Hoje
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          {weekday(day.dayKey)}
          <span aria-hidden> · </span>
          {day.events.length} {eventLabel}
          <span aria-hidden> · </span>
          {trackedHours}h registradas
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {day.events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
