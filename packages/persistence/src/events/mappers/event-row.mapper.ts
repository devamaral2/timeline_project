import {
  Event,
  EventItem,
  EventValidationError,
  Interruption,
  type EventPriority,
} from "@repo/entities";

export interface EventRow {
  id: string;
  revision: number;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date | null;
  missed: boolean;
  priority: EventPriority;
}

export interface EventItemRow {
  id: string;
  eventId: string;
  position: number;
  type: string;
  schemaVersion: number;
  isPrimary: boolean;
  data: unknown;
}

export interface EventInterruptionRow {
  id: string;
  eventId: string;
  position: number;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date;
}

export function mapEventItemRow(row: EventItemRow): EventItem {
  try {
    return EventItem.create({
      id: row.id,
      position: row.position,
      type: row.type,
      schemaVersion: row.schemaVersion,
      isPrimary: row.isPrimary,
      data: row.data,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new EventValidationError(
      `Invalid event item ${row.id} for event ${row.eventId}: ${message}`,
    );
  }
}

export function mapEventInterruptionRow(row: EventInterruptionRow): Interruption {
  return Interruption.create({
    id: row.id,
    name: row.name,
    description: row.description,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  });
}

export function mapEventRow(
  eventRow: EventRow,
  itemRows: readonly EventItemRow[],
  interruptionRows: readonly EventInterruptionRow[],
  tagNames: readonly string[],
): Event {
  const items = [...itemRows]
    .sort((a, b) => a.position - b.position)
    .map((row) => mapEventItemRow(row));

  const interruptions = [...interruptionRows]
    .sort((a, b) => a.position - b.position)
    .map((row) => mapEventInterruptionRow(row));

  return Event.rehydrate({
    id: eventRow.id,
    userId: eventRow.userId,
    name: eventRow.name,
    description: eventRow.description,
    startedAt: eventRow.startedAt,
    finishedAt: eventRow.finishedAt ?? undefined,
    tags: [...tagNames],
    interruptions,
    items,
    missed: eventRow.missed,
    priority: eventRow.priority,
    revision: eventRow.revision,
  });
}
