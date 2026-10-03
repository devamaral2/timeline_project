import type { Event, EventKind } from "../../../domain";
import type { DayContextEvent } from "../day-context.query";

export interface EventShift {
  id: string;
  kind: EventKind;
  startedAt: Date;
  finishedAt: Date;
}

export type Rearrangement =
  | { kind: "ready"; shifts: EventShift[] }
  | { kind: "clarification"; message: string };

/** Desloca apenas a cadeia que passou a sobrepor o evento âncora. */
export function planDayRearrangement(target: Event, dayEvents: readonly DayContextEvent[]): Rearrangement {
  if (!target.finishedAt) return { kind: "ready", shifts: [] };
  const targetStart = target.startedAt.getTime();
  let cursor = target.finishedAt.getTime();
  const events = dayEvents
    .filter((event) => event.id !== target.id)
    .map((event) => ({ ...event, start: Date.parse(event.started_at), end: event.finished_at ? Date.parse(event.finished_at) : null }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const preceding = events.find((event) => event.start < targetStart && (event.end === null || event.end > targetStart));
  if (preceding) {
    return { kind: "clarification", message: `O evento ${preceding.name} já ocupa o horário pedido. Qual dos dois deve manter esse horário?` };
  }

  const shifts: EventShift[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const current = events[index];
    if (current.start < targetStart) continue;
    if (current.start >= cursor) break;
    const next = events[index + 1];
    if (next?.start === current.start && next.start < cursor) {
      return { kind: "clarification", message: `Os eventos ${current.name} e ${next.name} começam no mesmo horário. Qual deve vir primeiro?` };
    }
    if (current.end === null || current.end < current.start) {
      return { kind: "clarification", message: `Não encontrei a duração de ${current.name}. Qual deve ser o horário final?` };
    }
    if (!current.kind) return { kind: "clarification", message: `Não identifiquei o tipo de ${current.name}.` };
    const duration = current.end - current.start;
    shifts.push({ id: current.id, kind: current.kind, startedAt: new Date(cursor), finishedAt: new Date(cursor + duration) });
    cursor += duration;
  }
  return { kind: "ready", shifts };
}
