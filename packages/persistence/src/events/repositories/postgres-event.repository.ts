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

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

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
}

async function insertEventAggregate(tx: Tx, event: Event): Promise<void> {
  await tx.insert(schema.events).values({
    id: event.id,
    revision: event.revision,
    userId: event.userId,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt ?? null,
    missed: event.missed,
    priority: event.priority,
  });

  await insertChildren(tx, event);
}

async function classifyUpdateFailure(
  tx: Tx,
  eventId: string,
  actorUserId: string,
  expectedRevision: number,
): Promise<never> {
  const [existing] = await tx
    .select({ userId: schema.events.userId, revision: schema.events.revision })
    .from(schema.events)
    .where(eq(schema.events.id, eventId));

  if (!existing) {
    throw new EventNotFoundError(`Event not found: ${eventId}`);
  }
  if (existing.userId !== actorUserId) {
    throw new EventOwnershipError();
  }
  throw new EventRevisionConflictError(
    `Expected revision ${expectedRevision} but found ${existing.revision}`,
  );
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(event: Event): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertEventAggregate(tx, event);
    });
  }

  async saveClosingLatestOpen(event: Event, finishedAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${event.userId}))`);

      const [openEvent] = await tx
        .select({
          id: schema.events.id,
          startedAt: schema.events.startedAt,
          finishedAt: schema.events.finishedAt,
          revision: schema.events.revision,
        })
        .from(schema.events)
        .where(eq(schema.events.userId, event.userId))
        .orderBy(desc(schema.events.startedAt), desc(schema.events.id))
        .limit(1);

      if (openEvent && !openEvent.finishedAt && finishedAt >= openEvent.startedAt) {
        await tx
          .update(schema.events)
          .set({ revision: openEvent.revision + 1, finishedAt, updatedAt: finishedAt })
          .where(eq(schema.events.id, openEvent.id));
      }

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
            revision = ${event.revision},
            updated_at = now()
        WHERE id = ${event.id}
          AND user_id = ${actorUserId}
          AND revision = ${expectedRevision}
        RETURNING revision
      `);

      if (result.rows.length === 0) {
        await classifyUpdateFailure(tx, event.id, actorUserId, expectedRevision);
      }

      await tx.delete(schema.eventItems).where(eq(schema.eventItems.eventId, event.id));
      await tx.delete(schema.eventInterruptions).where(eq(schema.eventInterruptions.eventId, event.id));
      await tx.delete(schema.eventTags).where(eq(schema.eventTags.eventId, event.id));

      await insertChildren(tx, event);
    });
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: schema.events.userId })
        .from(schema.events)
        .where(eq(schema.events.id, eventId));

      if (!existing) {
        throw new EventNotFoundError(`Event not found: ${eventId}`);
      }
      if (existing.userId !== actorUserId) {
        throw new EventOwnershipError();
      }

      await tx.delete(schema.events).where(eq(schema.events.id, eventId));
    });
  }

  async findById(eventId: string): Promise<Event | null> {
    const [eventRow] = await this.db.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!eventRow) return null;
    return this.hydrate(eventRow);
  }

  async findLatestOpenByUserId(userId: string): Promise<Event | null> {
    const [row] = await this.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.userId, userId))
      .orderBy(desc(schema.events.startedAt), desc(schema.events.id))
      .limit(1);

    if (!row || row.finishedAt) return null;
    return this.hydrate(row);
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

    return mapEventRow(
      eventRow,
      itemRows,
      interruptionRows,
      tagRows.map((row) => row.name),
    );
  }
}
