import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";
import {
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
} from "@repo/entities";
import type { EventRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapEventRow } from "../mappers/event-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { occurrenceColumnsOf } from "../../recurrences/mappers/occurrence-columns";

export type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

async function insertChildren(tx: Tx, event: Event): Promise<void> {
  if (event.items.length > 0) {
    await tx.insert(schema.eventItems).values(
      event.items.map((item) => ({
        id: item.id,
        eventId: event.id,
        position: item.position,
        type: item.type,
        schemaVersion: item.schemaVersion,
        isPrimary: item.isPrimary,
        data: item.data,
      })),
    );
  }

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
    const tagIds: string[] = [];
    for (const name of event.tags) {
      const [row] = await tx
        .insert(schema.tags)
        .values({ id: ulid(), userId: event.userId, name })
        .onConflictDoUpdate({
          target: [schema.tags.userId, schema.tags.name],
          set: { name: sql`excluded.name` },
        })
        .returning({ id: schema.tags.id });
      tagIds.push(row.id);
    }

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
export async function insertEventAggregate(tx: Tx, event: Event): Promise<boolean> {
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
      ...occurrenceColumnsOf(event.occurrence),
    })
    .onConflictDoNothing({
      target: [schema.events.recurrenceId, schema.events.occurrenceOn],
      where: sql`${schema.events.recurrenceId} IS NOT NULL`,
    })
    .returning({ id: schema.events.id });

  if (inserted.length === 0) return false;
  await insertChildren(tx, event);
  return true;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(event: Event): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertEventAggregate(tx, event);
    });
  }

  async update(event: Event, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE events
        SET name = ${event.name},
            description = ${event.description},
            started_at = ${event.startedAt},
            finished_at = ${event.finishedAt ?? null},
            missed = ${event.missed},
            priority = ${event.priority},
            recurrence_detached = ${event.occurrence?.detached ?? false},
            revision = ${event.revision},
            updated_at = now()
        WHERE id = ${event.id}
          AND user_id = ${actorUserId}
          AND revision = ${expectedRevision}
        RETURNING revision
      `);

      if (result.rows.length === 0) {
        const [existing] = await tx
          .select({ userId: schema.events.userId, revision: schema.events.revision })
          .from(schema.events)
          .where(eq(schema.events.id, event.id));

        classifyUpdateFailure(existing, actorUserId, expectedRevision, {
          notFound: () => new EventNotFoundError(`Event not found: ${event.id}`),
          ownership: () => new EventOwnershipError(),
          conflict: (message) => new EventRevisionConflictError(message),
        });
      }

      await tx.delete(schema.eventItems).where(eq(schema.eventItems.eventId, event.id));
      await tx.delete(schema.eventInterruptions).where(eq(schema.eventInterruptions.eventId, event.id));
      await tx.delete(schema.eventTags).where(eq(schema.eventTags.eventId, event.id));
      await tx.delete(schema.eventTasks).where(eq(schema.eventTasks.eventId, event.id));

      await insertChildren(tx, event);
    });
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          userId: schema.events.userId,
          recurrenceId: schema.events.recurrenceId,
          occurrenceOn: schema.events.occurrenceOn,
        })
        .from(schema.events)
        .where(eq(schema.events.id, eventId));

      if (!existing) {
        throw new EventNotFoundError(`Event not found: ${eventId}`);
      }
      if (existing.userId !== actorUserId) {
        throw new EventOwnershipError();
      }

      // Apagar uma ocorrencia pula o dia na serie: sem isto, ela voltaria na
      // proxima vez que a serie fosse editada e regerada.
      if (existing.recurrenceId && existing.occurrenceOn) {
        await tx
          .insert(schema.recurrenceExceptions)
          .values({ recurrenceId: existing.recurrenceId, occurrenceOn: existing.occurrenceOn })
          .onConflictDoNothing();
      }

      await tx.delete(schema.events).where(eq(schema.events.id, eventId));
    });
  }

  async findById(eventId: string): Promise<Event | null> {
    const [eventRow] = await this.db.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!eventRow) return null;
    return this.hydrate(eventRow);
  }

  private async hydrate(eventRow: typeof schema.events.$inferSelect): Promise<Event> {
    const itemRows = await this.db
      .select()
      .from(schema.eventItems)
      .where(eq(schema.eventItems.eventId, eventRow.id));
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
      .where(eq(schema.eventTasks.eventId, eventRow.id));

    return mapEventRow(
      eventRow,
      itemRows,
      interruptionRows,
      tagRows.map((row) => row.name),
      taskRows.map((row) => row.taskId),
    );
  }
}
