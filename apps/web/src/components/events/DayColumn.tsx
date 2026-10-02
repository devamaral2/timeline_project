import { mediumDate, relativeDayLabel, type TimelineDay } from '@repo/timeline';
import { EventCard } from './EventCard';

interface DayColumnProps {
  day: TimelineDay;
  todayKey: string;
}

export function DayColumn({ day, todayKey }: DayColumnProps) {
  const eventLabel = day.events.length === 1 ? 'evento' : 'eventos';
  const title = relativeDayLabel(day.dayKey, todayKey);

  return (
    <section
      aria-label={mediumDate(day.dayKey)}
      className="duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2.5 font-display text-2xl font-normal leading-[1.1] text-foreground sm:text-[26px]">
          {title}
          <span className="font-sans text-[13px] text-muted-foreground">
            {mediumDate(day.dayKey)}
          </span>
        </h2>
        <p className="text-[10px] font-medium uppercase leading-none tracking-[0.12em] text-muted-foreground">
          {day.events.length} {eventLabel}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {day.events.map((event) => (
          <li key={event.id} className="list-none">
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </section>
  );
}
