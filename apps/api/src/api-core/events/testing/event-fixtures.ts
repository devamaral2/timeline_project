import { DEFAULT_EVENT_KIND, Event, Note, isEventKind, type EventCreateProps, type EventKind } from "../../../domain";
import { InMemoryEventDatabase } from "./in-memory-event-database";

export interface NoteFixture {
  type: string;
  data: unknown;
  id?: string;
  name?: string;
}

export interface EventFixture {
  event: Event;
  notes: Note[];
}

/**
 * Um evento de teste com as notes dele, ja ligadas na ordem dada. Sem `kind`, a
 * natureza do evento e a da primeira note de meal, sleep ou training.
 */
export function eventWith(
  props: Omit<EventCreateProps, "noteLinks" | "kind"> & { kind?: EventKind },
  notes: readonly NoteFixture[] = [],
): EventFixture {
  const created = notes.map((fixture) =>
    Note.create({ userId: props.userId, id: fixture.id, name: fixture.name, type: fixture.type, data: fixture.data }),
  );
  const inferred = created.find((note) => isEventKind(note.type) && note.type !== DEFAULT_EVENT_KIND)?.type;
  const event = Event.create({
    ...props,
    kind: props.kind ?? (inferred as EventKind | undefined) ?? DEFAULT_EVENT_KIND,
    noteLinks: created.map((note) => ({ noteId: note.id, fromRecurrence: false })),
  });
  return { event, notes: created };
}

export function databaseOf(fixtures: readonly EventFixture[]): InMemoryEventDatabase {
  return new InMemoryEventDatabase(
    fixtures.map((fixture) => fixture.event),
    fixtures.flatMap((fixture) => fixture.notes),
  );
}
