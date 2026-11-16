import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  SEQUENCE_RELATION,
  type ArtifactLink,
  type ArtifactWrites,
} from "../../../../domain";
import type { EventRepository } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { writeArtifacts } from "../../artifacts/repositories/postgres-artifact.repository";
import { occurrenceColumnsOf } from "../../recurrences/mappers/occurrence-columns";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { pgIntegerArrayLiteral } from "../../shared/pg-integer-array";
import type { Db, Tx } from "../../shared/tx";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapEventRow, type EventRow, type EventRowParts } from "../mappers/event-row.mapper";
import {
  assertEventReferences,
  deleteEventRelations,
  insertEventRelations,
} from "./event-relations";

export type { Tx } from "../../shared/tx";

async function insertChildren(tx: Tx, event: Event): Promise<void> {
  await assertEventReferences(tx, event);
  await insertEventRelations(tx, event);

  if (event.tags.length > 0) {
    const tagIds = await upsertTagIds(tx, event.userId, event.tags);
    await tx.insert(schema.eventTags).values(tagIds.map((tagId) => ({ eventId: event.id, tagId })));
  }
}

/**
 * Insere o evento e o que sai dele. Devolve `false` quando o evento e uma
 * ocorrencia de um dia que a serie ja gerou: o indice unico recusa a linha e o
 * resto nem e tentado, porque apontaria para um evento que nao entrou.
 */
export async function insertEventAggregate(tx: Tx, event: Event, artifacts?: ArtifactWrites): Promise<boolean> {
  const inserted = await tx
    .insert(schema.events)
    .values({
      id: event.id,
      revision: event.revision,
      userId: event.userId,
      actor: event.actor,
      kind: event.kind,
      status: event.status ?? null,
      priority: event.priority,
      name: event.name,
      description: event.description,
      location: event.location,
      startedAt: event.startedAt ?? null,
      estimatedFinishAt: event.estimatedFinishAt ?? null,
      finishedAt: event.finishedAt ?? null,
      notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
      longRunning: event.longRunning,
      data: event.data,
      ...occurrenceColumnsOf(event.occurrence),
    })
    .onConflictDoNothing({
      target: [schema.events.recurrenceId, schema.events.occurrenceOn],
      where: sql`${schema.events.recurrenceId} IS NOT NULL`,
    })
    .returning({ id: schema.events.id });

  if (inserted.length === 0) return false;
  await writeArtifacts(tx, artifacts);
  await insertChildren(tx, event);
  return true;
}

/**
 * Atualiza a linha e regrava o que sai do evento. Linha apagada conta como
 * inexistente: quem edita algo que outra aba ja apagou recebe "nao encontrado".
 * So eventos de pessoa passam por aqui; os de agente mudam pelo proprio agente.
 */
export async function updateEventAggregate(
  tx: Tx,
  event: Event,
  actorUserId: string,
  expectedRevision: number,
  artifacts?: ArtifactWrites,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE events
    SET kind = ${event.kind},
        status = ${event.status ?? null},
        priority = ${event.priority},
        name = ${event.name},
        description = ${event.description},
        location = ${event.location},
        started_at = ${event.startedAt ?? null},
        estimated_finish_at = ${event.estimatedFinishAt ?? null},
        finished_at = ${event.finishedAt ?? null},
        notify_offsets_minutes = ${pgIntegerArrayLiteral(event.notifyOffsetsMinutes)}::integer[],
        long_running = ${event.longRunning},
        recurrence_detached = ${event.occurrence?.detached ?? false},
        revision = ${event.revision},
        updated_at = now()
    WHERE id = ${event.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND actor = 'human'
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length === 0) {
    const [existing] = await tx
      .select({ userId: schema.events.userId, revision: schema.events.revision })
      .from(schema.events)
      .where(and(eq(schema.events.id, event.id), eq(schema.events.actor, "human"), isNull(schema.events.deletedAt)));

    classifyUpdateFailure(existing, actorUserId, expectedRevision, {
      notFound: () => new EventNotFoundError(`Event not found: ${event.id}`),
      ownership: () => new EventOwnershipError(),
      conflict: (message) => new EventRevisionConflictError(message),
    });
  }

  await writeArtifacts(tx, artifacts);
  await deleteEventRelations(tx, event.id);
  await tx.delete(schema.eventTags).where(eq(schema.eventTags.eventId, event.id));

  await insertChildren(tx, event);
}

/** Soft delete de um evento de pessoa. As relacoes ficam e a leitura filtra `deleted_at IS NULL`. */
export async function softDeleteEvent(tx: Tx, eventId: string, actorUserId: string): Promise<void> {
  const [existing] = await tx
    .select({
      userId: schema.events.userId,
      recurrenceId: schema.events.recurrenceId,
      occurrenceOn: schema.events.occurrenceOn,
    })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.actor, "human"), isNull(schema.events.deletedAt)));

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

interface MutableEventParts extends EventRowParts {
  tags: string[];
  artifactLinks: ArtifactLink[];
  nextIds: string[];
  previousIds: string[];
}

/** O que completa cada evento, lido das outras tabelas em poucas consultas, para qualquer quantidade de eventos. */
export async function loadEventParts(db: Db | Tx, eventIds: readonly string[]): Promise<Map<string, EventRowParts>> {
  const parts = new Map<string, MutableEventParts>();
  for (const id of eventIds) {
    parts.set(id, { tags: [], artifactLinks: [], nextIds: [], previousIds: [] });
  }
  if (eventIds.length === 0) return parts;
  const ids = [...eventIds];

  const [tagRows, artifactRows, outgoing, incoming] = await Promise.all([
    db
      .select({ eventId: schema.eventTags.eventId, name: schema.tags.name })
      .from(schema.eventTags)
      .innerJoin(schema.tags, eq(schema.eventTags.tagId, schema.tags.id))
      .where(inArray(schema.eventTags.eventId, ids))
      .orderBy(asc(schema.tags.name)),
    db
      .select({
        eventId: schema.eventArtifactRelation.eventId,
        artifactId: schema.eventArtifactRelation.artifactId,
        relation: schema.eventArtifactRelation.relation,
        fromRecurrence: schema.eventArtifactRelation.fromRecurrence,
      })
      .from(schema.eventArtifactRelation)
      .innerJoin(schema.artifacts, eq(schema.eventArtifactRelation.artifactId, schema.artifacts.id))
      .where(and(inArray(schema.eventArtifactRelation.eventId, ids), isNull(schema.artifacts.deletedAt)))
      .orderBy(asc(schema.eventArtifactRelation.position), asc(schema.eventArtifactRelation.createdAt)),
    db
      .select({
        eventId: schema.eventEventRelation.fromEventId,
        otherId: schema.eventEventRelation.toEventId,
      })
      .from(schema.eventEventRelation)
      .innerJoin(schema.events, eq(schema.eventEventRelation.toEventId, schema.events.id))
      .where(
        and(
          inArray(schema.eventEventRelation.fromEventId, ids),
          eq(schema.eventEventRelation.relation, SEQUENCE_RELATION),
          isNull(schema.events.deletedAt),
        ),
      )
      .orderBy(asc(schema.eventEventRelation.createdAt), asc(schema.eventEventRelation.toEventId)),
    db
      .select({
        eventId: schema.eventEventRelation.toEventId,
        otherId: schema.eventEventRelation.fromEventId,
      })
      .from(schema.eventEventRelation)
      .innerJoin(schema.events, eq(schema.eventEventRelation.fromEventId, schema.events.id))
      .where(
        and(
          inArray(schema.eventEventRelation.toEventId, ids),
          eq(schema.eventEventRelation.relation, SEQUENCE_RELATION),
          isNull(schema.events.deletedAt),
        ),
      )
      .orderBy(asc(schema.eventEventRelation.createdAt), asc(schema.eventEventRelation.fromEventId)),
  ]);

  for (const row of tagRows) parts.get(row.eventId)?.tags.push(row.name);
  for (const row of artifactRows) {
    const link: ArtifactLink = { artifactId: row.artifactId, relation: row.relation, fromRecurrence: row.fromRecurrence };
    parts.get(row.eventId)?.artifactLinks.push(link);
  }
  for (const row of outgoing) {
    parts.get(row.eventId)?.nextIds.push(row.otherId);
  }
  for (const row of incoming) {
    parts.get(row.eventId)?.previousIds.push(row.otherId);
  }
  return parts;
}

export async function hydrateEvents(db: Db | Tx, rows: readonly EventRow[]): Promise<Event[]> {
  const parts = await loadEventParts(db, rows.map((row) => row.id));
  return rows.map((row) => mapEventRow(row, parts.get(row.id)));
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: Db) {}

  async save(event: Event, artifacts?: ArtifactWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertEventAggregate(tx, event, artifacts);
    });
  }

  async update(event: Event, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateEventAggregate(tx, event, actorUserId, expectedRevision, artifacts);
    });
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteEvent(tx, eventId, actorUserId);
    });
  }

  async findById(eventId: string): Promise<Event | null> {
    const [event] = await this.findByIds([eventId]);
    return event ?? null;
  }

  async findByIds(eventIds: readonly string[]): Promise<Event[]> {
    if (eventIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(and(inArray(schema.events.id, [...eventIds]), isNull(schema.events.deletedAt)));
    return hydrateEvents(this.db, rows);
  }
}
