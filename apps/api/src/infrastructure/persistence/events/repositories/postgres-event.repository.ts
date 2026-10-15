import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  type NoteWrites,
} from "../../../../domain";
import type { EventRepository } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { mapEventRow } from "../mappers/event-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { pgIntegerArrayLiteral } from "../../shared/pg-integer-array";
import { occurrenceColumnsOf } from "../../recurrences/mappers/occurrence-columns";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { writeNotes } from "../../notes/repositories/postgres-note.repository";
import { insertEventNoteLinks, selectEventNoteLinks } from "../../notes/repositories/note-links";
import { completeCurrentAiJob } from "../../../ai-jobs/ai-job-context";

export type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

async function insertChildren(tx: Tx, event: Event): Promise<void> {
  await insertEventNoteLinks(tx, event.id, event.noteLinks);

  if (event.interruptions.length > 0) {
    await tx.insert(schema.eventInterruptions).values(
      event.interruptions.map((interruption, index) => ({
        id: interruption.id,
        eventId: event.id,
        position: index,
        name: interruption.name,
        description: interruption.description,
        startedAt: interruption.startedAt,
        finishedAt: interruption.finishedAt,
      })),
    );
  }

  if (event.tags.length > 0) {
    const tagIds = await upsertTagIds(tx, event.userId, event.tags);

    await tx.insert(schema.eventTags).values(tagIds.map((tagId) => ({ eventId: event.id, tagId })));
  }

  if (event.taskIds.length > 0) {
    await tx
      .insert(schema.eventTasks)
      .values(event.taskIds.map((taskId) => ({ eventId: event.id, taskId })));
  }
}

/**
 * Insere o evento e os filhos. Devolve `false` quando o evento e uma ocorrencia
 * de um dia que a serie ja gerou — o indice unico recusa a linha e os filhos
 * nem sao tentados, porque apontariam para um evento que nao entrou.
 */
export async function insertEventAggregate(tx: Tx, event: Event, notes?: NoteWrites): Promise<boolean> {
  const inserted = await tx
    .insert(schema.events)
    .values({
      id: event.id,
      revision: event.revision,
      userId: event.userId,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt,
      finishedAt: event.finishedAt ?? null,
      missed: event.missed,
      priority: event.priority,
      kind: event.kind,
      notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
      ...occurrenceColumnsOf(event.occurrence),
    })
    .onConflictDoNothing({
      target: [schema.events.recurrenceId, schema.events.occurrenceOn],
      where: sql`${schema.events.recurrenceId} IS NOT NULL`,
    })
    .returning({ id: schema.events.id });

  if (inserted.length === 0) return false;
  await writeNotes(tx, notes);
  await insertChildren(tx, event);
  return true;
}

/**
 * Atualiza a linha e regrava os filhos. Linha apagada conta como inexistente:
 * quem edita algo que outra aba ja apagou recebe "nao encontrado".
 */
export async function updateEventAggregate(
  tx: Tx,
  event: Event,
  actorUserId: string,
  expectedRevision: number,
  notes?: NoteWrites,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE events
    SET name = ${event.name},
        description = ${event.description},
        started_at = ${event.startedAt},
        finished_at = ${event.finishedAt ?? null},
        missed = ${event.missed},
        priority = ${event.priority},
        kind = ${event.kind},
        notify_offsets_minutes = ${pgIntegerArrayLiteral(event.notifyOffsetsMinutes)}::integer[],
        recurrence_detached = ${event.occurrence?.detached ?? false},
        revision = ${event.revision},
        updated_at = now()
    WHERE id = ${event.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length === 0) {
    const [existing] = await tx
      .select({ userId: schema.events.userId, revision: schema.events.revision })
      .from(schema.events)
      .where(and(eq(schema.events.id, event.id), isNull(schema.events.deletedAt)));

    classifyUpdateFailure(existing, actorUserId, expectedRevision, {
      notFound: () => new EventNotFoundError(`Event not found: ${event.id}`),
      ownership: () => new EventOwnershipError(),
      conflict: (message) => new EventRevisionConflictError(message),
    });
  }

  await writeNotes(tx, notes);
  await tx.delete(schema.eventNotes).where(eq(schema.eventNotes.eventId, event.id));
  await tx.delete(schema.eventInterruptions).where(eq(schema.eventInterruptions.eventId, event.id));
  await tx.delete(schema.eventTags).where(eq(schema.eventTags.eventId, event.id));
  await tx.delete(schema.eventTasks).where(eq(schema.eventTasks.eventId, event.id));

  await insertChildren(tx, event);
}

export async function softDeleteEvent(tx: Tx, eventId: string, actorUserId: string): Promise<void> {
  const [existing] = await tx
    .select({
      userId: schema.events.userId,
      recurrenceId: schema.events.recurrenceId,
      occurrenceOn: schema.events.occurrenceOn,
    })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.deletedAt)));

  if (!existing) {
    throw new EventNotFoundError(`Event not found: ${eventId}`);
  }
  if (existing.userId !== actorUserId) {
    throw new EventOwnershipError();
  }

  // A linha apagada ja ocupa o dia no indice unico, mas a edicao da serie faz
  // hard delete das ocorrencias futuras e regera: sem a excecao, o dia voltaria.
  if (existing.recurrenceId && existing.occurrenceOn) {
    await tx
      .insert(schema.recurrenceExceptions)
      .values({ recurrenceId: existing.recurrenceId, occurrenceOn: existing.occurrenceOn })
      .onConflictDoNothing();
  }

  await tx
    .update(schema.events)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.events.id, eventId));
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(event: Event, notes?: NoteWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertEventAggregate(tx, event, notes);
      await completeCurrentAiJob(tx);
    });
  }

  async update(event: Event, actorUserId: string, expectedRevision: number, notes?: NoteWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateEventAggregate(tx, event, actorUserId, expectedRevision, notes);
    });
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteEvent(tx, eventId, actorUserId);
    });
  }

  async findById(eventId: string): Promise<Event | null> {
    const [eventRow] = await this.db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.id, eventId), isNull(schema.events.deletedAt)));
    if (!eventRow) return null;
    return this.hydrate(eventRow);
  }

  private async hydrate(eventRow: typeof schema.events.$inferSelect): Promise<Event> {
    const noteLinks = await selectEventNoteLinks(this.db, eventRow.id);
    const interruptionRows = await this.db
      .select()
      .from(schema.eventInterruptions)
      .where(eq(schema.eventInterruptions.eventId, eventRow.id));
    const tagRows = await this.db
      .select({ name: schema.tags.name })
      .from(schema.eventTags)
      .innerJoin(schema.tags, eq(schema.eventTags.tagId, schema.tags.id))
      .where(eq(schema.eventTags.eventId, eventRow.id));
    const taskRows = await this.db
      .select({ taskId: schema.eventTasks.taskId })
      .from(schema.eventTasks)
      .innerJoin(schema.tasks, eq(schema.eventTasks.taskId, schema.tasks.id))
      .where(and(eq(schema.eventTasks.eventId, eventRow.id), isNull(schema.tasks.deletedAt)));

    return mapEventRow(
      eventRow,
      noteLinks,
      interruptionRows,
      tagRows.map((row) => row.name),
      taskRows.map((row) => row.taskId),
    );
  }
}
