import { and, asc, eq, isNull } from "drizzle-orm";
import type { NoteLink } from "../../../../domain";
import * as schema from "../../database/schema";
import type { Tx } from "../../events/repositories/postgres-event.repository";

/**
 * Os vinculos de um alvo, na ordem. A posicao e o indice no array: a lista que
 * o dominio entrega ja e a ordem final, entao regrava tudo (como as tags).
 * Vinculos a notes apagadas (soft delete) nao voltam do banco e, portanto,
 * somem na primeira gravacao seguinte.
 */
export async function replaceEventNoteLinks(tx: Tx, eventId: string, links: readonly NoteLink[]): Promise<void> {
  await tx.delete(schema.eventNotes).where(eq(schema.eventNotes.eventId, eventId));
  await insertEventNoteLinks(tx, eventId, links);
}

export async function insertEventNoteLinks(tx: Tx, eventId: string, links: readonly NoteLink[]): Promise<void> {
  if (links.length === 0) return;
  await tx.insert(schema.eventNotes).values(
    links.map((link, position) => ({
      eventId,
      noteId: link.noteId,
      position,
      fromRecurrence: link.fromRecurrence,
    })),
  );
}

export async function replaceTaskNoteLinks(tx: Tx, taskId: string, links: readonly NoteLink[]): Promise<void> {
  await tx.delete(schema.taskNotes).where(eq(schema.taskNotes.taskId, taskId));
  await insertTaskNoteLinks(tx, taskId, links);
}

export async function insertTaskNoteLinks(tx: Tx, taskId: string, links: readonly NoteLink[]): Promise<void> {
  if (links.length === 0) return;
  await tx.insert(schema.taskNotes).values(
    links.map((link, position) => ({
      taskId,
      noteId: link.noteId,
      position,
      fromRecurrence: link.fromRecurrence,
    })),
  );
}

export async function replaceRecurrenceNoteIds(tx: Tx, recurrenceId: string, noteIds: readonly string[]): Promise<void> {
  await tx.delete(schema.recurrenceNotes).where(eq(schema.recurrenceNotes.recurrenceId, recurrenceId));
  if (noteIds.length === 0) return;
  await tx
    .insert(schema.recurrenceNotes)
    .values(noteIds.map((noteId, position) => ({ recurrenceId, noteId, position })));
}

/** Os vinculos vivos de um evento (a note nao foi apagada), por posicao. */
export async function selectEventNoteLinks(
  db: Pick<Tx, "select">,
  eventId: string,
): Promise<NoteLink[]> {
  const rows = await db
    .select({ noteId: schema.eventNotes.noteId, fromRecurrence: schema.eventNotes.fromRecurrence })
    .from(schema.eventNotes)
    .innerJoin(schema.notes, eq(schema.eventNotes.noteId, schema.notes.id))
    .where(and(eq(schema.eventNotes.eventId, eventId), isNull(schema.notes.deletedAt)))
    .orderBy(asc(schema.eventNotes.position));
  return rows;
}

export async function selectTaskNoteLinks(db: Pick<Tx, "select">, taskId: string): Promise<NoteLink[]> {
  const rows = await db
    .select({ noteId: schema.taskNotes.noteId, fromRecurrence: schema.taskNotes.fromRecurrence })
    .from(schema.taskNotes)
    .innerJoin(schema.notes, eq(schema.taskNotes.noteId, schema.notes.id))
    .where(and(eq(schema.taskNotes.taskId, taskId), isNull(schema.notes.deletedAt)))
    .orderBy(asc(schema.taskNotes.position));
  return rows;
}

export async function selectRecurrenceNoteIds(db: Pick<Tx, "select">, recurrenceId: string): Promise<string[]> {
  const rows = await db
    .select({ noteId: schema.recurrenceNotes.noteId })
    .from(schema.recurrenceNotes)
    .innerJoin(schema.notes, eq(schema.recurrenceNotes.noteId, schema.notes.id))
    .where(and(eq(schema.recurrenceNotes.recurrenceId, recurrenceId), isNull(schema.notes.deletedAt)))
    .orderBy(asc(schema.recurrenceNotes.position));
  return rows.map((row) => row.noteId);
}
