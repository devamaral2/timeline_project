import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Note, NoteNotFoundError, NoteOwnershipError, NoteRevisionConflictError } from "@repo/entities";
import type { NoteRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapNoteRow } from "../mappers/note-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Tx } from "../../events/repositories/postgres-event.repository";

export async function insertNote(tx: Tx, note: Note): Promise<void> {
  await tx.insert(schema.notes).values({
    id: note.id,
    revision: note.revision,
    userId: note.userId,
    content: note.content,
    eventId: note.eventId ?? null,
    taskId: note.taskId ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });
  await insertNoteTags(tx, note);
}

async function insertNoteTags(tx: Tx, note: Note): Promise<void> {
  if (note.tags.length === 0) return;

  const tagIds = await upsertTagIds(tx, note.userId, note.tags);
  await tx.insert(schema.noteTags).values(tagIds.map((tagId) => ({ noteId: note.id, tagId })));
}

export async function updateNoteAggregate(
  tx: Tx,
  note: Note,
  actorUserId: string,
  expectedRevision: number,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE notes
    SET content = ${note.content},
        event_id = ${note.eventId ?? null},
        task_id = ${note.taskId ?? null},
        revision = ${note.revision},
        updated_at = now()
    WHERE id = ${note.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length > 0) {
    await tx.delete(schema.noteTags).where(eq(schema.noteTags.noteId, note.id));
    await insertNoteTags(tx, note);
    return;
  }

  const [existing] = await tx
    .select({ userId: schema.notes.userId, revision: schema.notes.revision })
    .from(schema.notes)
    .where(and(eq(schema.notes.id, note.id), isNull(schema.notes.deletedAt)));

  classifyUpdateFailure(existing, actorUserId, expectedRevision, {
    notFound: () => new NoteNotFoundError(`Note not found: ${note.id}`),
    ownership: () => new NoteOwnershipError(),
    conflict: (message) => new NoteRevisionConflictError(message),
  });
}

export async function softDeleteNote(tx: Tx, noteId: string, actorUserId: string): Promise<void> {
  const [existing] = await tx
    .select({ userId: schema.notes.userId })
    .from(schema.notes)
    .where(and(eq(schema.notes.id, noteId), isNull(schema.notes.deletedAt)));

  if (!existing) throw new NoteNotFoundError(`Note not found: ${noteId}`);
  if (existing.userId !== actorUserId) throw new NoteOwnershipError();

  await tx
    .update(schema.notes)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.notes.id, noteId));
}

/** A nota so existe presa ao alvo: apagar o evento ou a tarefa apaga as notas dele. */
export async function softDeleteNotesOfTargets(
  tx: Tx,
  target: { eventIds?: readonly string[]; taskIds?: readonly string[] },
): Promise<void> {
  const conditions = [];
  if (target.eventIds && target.eventIds.length > 0) {
    conditions.push(inArray(schema.notes.eventId, [...target.eventIds]));
  }
  if (target.taskIds && target.taskIds.length > 0) {
    conditions.push(inArray(schema.notes.taskId, [...target.taskIds]));
  }

  for (const condition of conditions) {
    await tx
      .update(schema.notes)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(condition, isNull(schema.notes.deletedAt)));
  }
}

export class PostgresNoteRepository implements NoteRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(note: Note): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertNote(tx, note);
    });
  }

  async update(note: Note, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateNoteAggregate(tx, note, actorUserId, expectedRevision);
    });
  }

  async delete(noteId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteNote(tx, noteId, actorUserId);
    });
  }

  async findById(noteId: string): Promise<Note | null> {
    const [row] = await this.db
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.id, noteId), isNull(schema.notes.deletedAt)));
    if (!row) return null;

    const tagRows = await this.db
      .select({ name: schema.tags.name })
      .from(schema.noteTags)
      .innerJoin(schema.tags, eq(schema.noteTags.tagId, schema.tags.id))
      .where(eq(schema.noteTags.noteId, row.id));
    return mapNoteRow(
      row,
      tagRows.map((tagRow) => tagRow.name),
    );
  }
}
