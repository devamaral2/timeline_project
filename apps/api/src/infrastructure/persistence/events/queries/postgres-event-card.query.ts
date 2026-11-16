import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { MAX_EVENT_BLOCK_DAYS, type Recurrence } from "../../../../domain";
import type {
  AgendaPage,
  AgendaQueryParams,
  EventCard,
  EventCardQuery,
  TrackedQueryParams,
} from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { mapRecurrenceRow } from "../../recurrences/mappers/recurrence-row.mapper";
import type { Db } from "../../shared/tx";
import type { EventRow } from "../mappers/event-row.mapper";
import { hydrateEvents } from "../repositories/postgres-event.repository";
import { decodeAgendaCursor, encodeAgendaCursor } from "./agenda-cursor";

/** Os status de pessoa em que o evento ainda esta em aberto. */
const OPEN_STATUSES = ["todo", "toDefine", "doing", "inHold"] as const;

function hasTag(userId: string, tag: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM event_tags et
    JOIN tags t ON t.id = et.tag_id
    WHERE et.event_id = e.id AND t.user_id = ${userId} AND t.name = ${tag}
  )`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class PostgresEventCardQuery implements EventCardQuery {
  constructor(private readonly db: Db) {}

  async agenda(params: AgendaQueryParams): Promise<AgendaPage> {
    // As mesmas condicoes do indice parcial `events_agenda_idx`.
    const conditions: SQL[] = [
      sql`e.user_id = ${params.userId}`,
      sql`e.started_at IS NOT NULL`,
      sql`NOT e.long_running`,
      sql`e.kind <> 'step'`,
      sql`e.deleted_at IS NULL`,
    ];
    if (params.to) conditions.push(sql`e.started_at <= ${params.to}`);
    if (params.from) {
      // Um bloco dura no maximo 31 dias: quem ainda toca a janela comecou no maximo isso antes dela.
      conditions.push(sql`e.started_at >= ${params.from}::timestamptz - ${`${MAX_EVENT_BLOCK_DAYS} days`}::interval`);
      conditions.push(sql`coalesce(e.estimated_finish_at, e.finished_at, e.started_at) >= ${params.from}`);
    }
    if (params.actor) conditions.push(sql`e.actor = ${params.actor}`);
    if (params.kind) conditions.push(sql`e.kind = ${params.kind}`);
    if (params.tag) conditions.push(hasTag(params.userId, params.tag));
    if (params.cursor) {
      const cursor = decodeAgendaCursor(params.cursor);
      conditions.push(sql`(e.started_at, e.id) < (${cursor.startedAt}, ${cursor.id})`);
    }

    const page = await this.db.execute<{ id: string; started_at: Date }>(sql`
      SELECT e.id, e.started_at
      FROM events e
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY e.started_at DESC, e.id DESC
      LIMIT ${params.limit + 1}
    `);
    const hasNextPage = page.rows.length > params.limit;
    const rows = page.rows.slice(0, params.limit);
    const last = rows.at(-1);

    return {
      items: await this.cardsOf(rows.map((row) => row.id)),
      nextCursor:
        hasNextPage && last ? encodeAgendaCursor({ startedAt: new Date(last.started_at), id: last.id }) : undefined,
    };
  }

  async tracked(params: TrackedQueryParams): Promise<EventCard[]> {
    // As mesmas condicoes do indice parcial `events_tracked_idx`.
    const conditions: SQL[] = [
      sql`e.user_id = ${params.userId}`,
      sql`e.status IS NOT NULL`,
      sql`e.kind <> 'step'`,
      sql`e.deleted_at IS NULL`,
      // Uma serie aparece uma vez so: pela proxima ocorrencia em aberto. A ocorrencia que alguem
      // editou (concluir e editar) ja nao acompanha a serie e aparece por si.
      sql`(e.recurrence_id IS NULL OR e.recurrence_detached OR e.id = (
        SELECT o.id FROM events o
        WHERE o.recurrence_id = e.recurrence_id AND NOT o.recurrence_detached AND o.deleted_at IS NULL
          AND o.status IN ${[...OPEN_STATUSES]}
        ORDER BY o.occurrence_on
        LIMIT 1
      ))`,
    ];
    if (params.actor) conditions.push(sql`e.actor = ${params.actor}`);
    if (params.status?.length) conditions.push(sql`e.status IN ${params.status}`);
    if (params.priority?.length) conditions.push(sql`e.priority IN ${params.priority}`);
    if (params.tag) conditions.push(hasTag(params.userId, params.tag));
    if (params.q) conditions.push(sql`lower(e.name) LIKE ${`%${escapeLike(params.q)}%`} ESCAPE '\\'`);
    if (params.from) conditions.push(sql`coalesce(e.started_at, e.estimated_finish_at) >= ${params.from}`);
    if (params.to) conditions.push(sql`coalesce(e.started_at, e.estimated_finish_at) <= ${params.to}`);
    if (params.longRunning !== undefined) {
      conditions.push(params.longRunning ? sql`e.long_running` : sql`NOT e.long_running`);
    }

    const result = await this.db.execute<{ id: string }>(sql`
      SELECT e.id
      FROM events e
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY coalesce(e.started_at, e.estimated_finish_at) NULLS LAST, e.id
      ${params.limit === undefined ? sql`` : sql`LIMIT ${params.limit}`}
    `);
    return this.cardsOf(result.rows.map((row) => row.id));
  }

  async cardsOf(eventIds: readonly string[]): Promise<EventCard[]> {
    if (eventIds.length === 0) return [];
    const ids = [...eventIds];

    const rows: EventRow[] = await this.db
      .select()
      .from(schema.events)
      .where(and(inArray(schema.events.id, ids), isNull(schema.events.deletedAt)));
    const events = await hydrateEvents(this.db, rows);

    const [typeRows, recurrences] = await Promise.all([
      this.db
        .select({ eventId: schema.eventArtifactRelation.eventId, type: schema.artifacts.type })
        .from(schema.eventArtifactRelation)
        .innerJoin(schema.artifacts, eq(schema.eventArtifactRelation.artifactId, schema.artifacts.id))
        .where(and(inArray(schema.eventArtifactRelation.eventId, ids), isNull(schema.artifacts.deletedAt)))
        .orderBy(schema.eventArtifactRelation.position, schema.eventArtifactRelation.createdAt),
      this.recurrencesOf(rows),
    ]);
    const typesByEvent = new Map<string, string[]>();
    for (const row of typeRows) {
      typesByEvent.set(row.eventId, [...(typesByEvent.get(row.eventId) ?? []), row.type]);
    }

    const byId = new Map(events.map((event) => [event.id, event]));
    return ids.flatMap((id) => {
      const event = byId.get(id);
      if (!event) return [];
      const recurrence = event.occurrence ? recurrences.get(event.occurrence.recurrenceId) : undefined;
      return [{ event, artifactTypes: typesByEvent.get(id) ?? [], ...(recurrence ? { recurrence } : {}) }];
    });
  }

  private async recurrencesOf(rows: readonly EventRow[]): Promise<Map<string, Recurrence>> {
    const recurrenceIds = [...new Set(rows.flatMap((row) => (row.recurrenceId ? [row.recurrenceId] : [])))];
    if (recurrenceIds.length === 0) return new Map();
    const found = await this.db.select().from(schema.recurrences).where(inArray(schema.recurrences.id, recurrenceIds));
    return new Map(found.map((row) => [row.id, mapRecurrenceRow(row)]));
  }
}
