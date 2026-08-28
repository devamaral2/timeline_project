import {
  longDate,
  longestDurationOf,
  trackedMinutesOf,
  type TimelineDay,
} from '@repo/timeline';
import { EventCard } from './EventCard';

interface DayColumnProps {
  day: TimelineDay;
}

export function DayColumn({ day }: DayColumnProps) {
  const trackedHours = Math.round(trackedMinutesOf(day.events) / 60);
  // A escala da barra de duracao e o dia, nao a timeline inteira: os cartoes
  // que o olho compara sao os que estao juntos nesta coluna.
  const longestMinutes = longestDurationOf(day.events);
  const eventLabel = day.events.length === 1 ? 'evento' : 'eventos';

  return (
    <section
      aria-label={longDate(day.dayKey)}
      className="duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      <p className="mb-3 text-[13px] font-semibold text-muted-foreground">
        {day.events.length} {eventLabel}
        <span aria-hidden> · </span>
        <span className="tabular-nums">{trackedHours}h</span> registradas
      </p>

      <div className="flex flex-col gap-3">
        {day.events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            longestMinutes={longestMinutes}
          />
        ))}
      </div>
    </section>
  );
}
