import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  Note,
  NoteNotFoundError,
  NoteOwnershipError,
  NoteRevisionConflictError,
  type MealItem,
  type NoteWrites,
} from "../../../../domain";
import type {
  MealNoteGenerationPayload,
  MealNoteGenerationRepository,
  MealNoteGenerationResult,
  NoteRepository,
} from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapNoteRow } from "../mappers/note-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Tx } from "../../events/repositories/postgres-event.repository";
import { completeCurrentAiJob, enqueueMealNote, setAiJobFailure, setAiJobResult } from "../../../ai-jobs/ai-job-context";

export async function insertNote(tx: Tx, note: Note): Promise<void> {
  await tx.insert(schema.notes).values({
    id: note.id,
    revision: note.revision,
    userId: note.userId,
    name: note.name,
    type: note.type,
    schemaVersion: note.schemaVersion,
    data: note.data,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });
  await insertNoteTags(tx, note);
  const meal = note.data as MealItem;
  if (note.type === "meal" && meal.generation?.status === "pending") {
    await enqueueMealNote(tx, note.id, note.userId, {
      noteId: note.id,
      userId: note.userId,
      expectedRevision: note.revision,
      description: meal.description,
      name: meal.name,
    });
  }
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
    SET name = ${note.name},
        type = ${note.type},
        schema_version = ${note.schemaVersion},
        data = ${JSON.stringify(note.data)}::jsonb,
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

/**
 * Grava as notes que viajam com um evento, tarefa ou serie. Vem antes dos
 * vinculos, na mesma transacao: um vinculo aponta para uma note que ja existe.
 */
export async function writeNotes(tx: Tx, writes: NoteWrites | undefined): Promise<void> {
  for (const note of writes?.created ?? []) {
    await insertNote(tx, note);
  }
  for (const { note, expectedRevision } of writes?.updated ?? []) {
    await updateNoteAggregate(tx, note, note.userId, expectedRevision);
  }
}

/**
 * Soft delete: os vinculos ficam e a leitura filtra `deleted_at IS NULL`. Nao
 * ha `cascade` de evento ou tarefa para a note — apagar o alvo so solta o vinculo.
 */
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

export class PostgresNoteRepository implements NoteRepository, MealNoteGenerationRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async finishMealGeneration(
    payload: MealNoteGenerationPayload,
    data: MealItem | null,
    result: MealNoteGenerationResult,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let applied = false;
      if (data) {
        const updated = await tx.execute(sql`
          UPDATE notes
          SET data = ${JSON.stringify(data)}::jsonb,
              revision = revision + 1,
              updated_at = now()
          WHERE id = ${payload.noteId}
            AND user_id = ${payload.userId}
            AND revision = ${payload.expectedRevision}
            AND type = 'meal'
            AND deleted_at IS NULL
            AND data->'generation'->>'status' = 'pending'
            AND data->>'description' = ${payload.description}
            AND data->>'name' = ${payload.name}
          RETURNING id
        `);
        applied = updated.rows.length > 0;
      }
      setAiJobResult(applied ? result : { status: "skipped", noteId: payload.noteId });
      if (applied && result.status === "failed") setAiJobFailure("unavailable");
      await completeCurrentAiJob(tx);
      return applied;
    });
  }

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
    const [note] = await this.findByIds([noteId]);
    return note ?? null;
  }

  async findByIds(noteIds: readonly string[]): Promise<Note[]> {
    if (noteIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(schema.notes)
      .where(and(inArray(schema.notes.id, [...noteIds]), isNull(schema.notes.deletedAt)));
    if (rows.length === 0) return [];

    const tagRows = await this.db
      .select({ noteId: schema.noteTags.noteId, name: schema.tags.name })
      .from(schema.noteTags)
      .innerJoin(schema.tags, eq(schema.noteTags.tagId, schema.tags.id))
      .where(
        inArray(
          schema.noteTags.noteId,
          rows.map((row) => row.id),
        ),
      );
    const tagsByNote = new Map<string, string[]>();
    for (const { noteId, name } of tagRows) {
      tagsByNote.set(noteId, [...(tagsByNote.get(noteId) ?? []), name]);
    }
    return rows.map((row) => mapNoteRow(row, tagsByNote.get(row.id) ?? []));
  }

  async listByUserId(userId: string): Promise<Note[]> {
    const rows = await this.db
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.userId, userId), isNull(schema.notes.deletedAt)))
      .orderBy(desc(schema.notes.updatedAt), desc(schema.notes.id));
    if (rows.length === 0) return [];

    const tagRows = await this.db
      .select({ noteId: schema.noteTags.noteId, name: schema.tags.name })
      .from(schema.noteTags)
      .innerJoin(schema.tags, eq(schema.noteTags.tagId, schema.tags.id))
      .where(inArray(schema.noteTags.noteId, rows.map((row) => row.id)));
    const tagsByNote = new Map<string, string[]>();
    for (const { noteId, name } of tagRows) {
      tagsByNote.set(noteId, [...(tagsByNote.get(noteId) ?? []), name]);
    }
    return rows.map((row) => mapNoteRow(row, tagsByNote.get(row.id) ?? []));
  }
}
