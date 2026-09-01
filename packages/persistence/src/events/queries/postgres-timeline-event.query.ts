import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TimelineEventQuery, TimelineQueryParams } from "@repo/entities/ports";
import type { TimelineEventCardDto, TimelineEventPageDto } from "@repo/entities/contracts";
import * as schema from "../../database/schema";
import { decodeTimelineCursor, encodeTimelineCursor } from "./timeline-cursor";

interface EventRow extends Record<string, unknown> {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  missed: boolean;
  name: string;
  description: string;
}

interface ItemRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  type: string;
  is_primary: boolean;
}

interface TagRow extends Record<string, unknown> {
  event_id: string;
  name: string;
}

interface InterruptionRow extends Record<string, unknown> {
  event_id: string;
  name: string;
  description: string;
  started_at: Date;
  finished_at: Date;
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "--";
  const minutes = Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${minutes}m`;
}

export class PostgresTimelineEventQuery implements TimelineEventQuery {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async list(params: TimelineQueryParams): Promise<TimelineEventPageDto> {
    const limitPlusOne = params.limit + 1;
    const conditions: SQL[] = [sql`e.user_id = ${params.userId}`];

    if (params.to) {
      conditions.push(sql`e.started_at <= ${params.to}`);
    }
    if (params.from) {
      conditions.push(sql`(e.started_at >= ${params.from} OR e.finished_at >= ${params.from})`);
    }
    if (params.type) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM event_items ei WHERE ei.event_id = e.id AND ei.type = ${params.type})`,
      );
    }
    if (params.tag) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM event_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.event_id = e.id AND t.user_id = ${params.userId} AND t.name = ${params.tag}
        )`,
      );
    }
    if (params.cursor) {
      const cursor = decodeTimelineCursor(params.cursor);
      conditions.push(sql`(e.started_at, e.id) < (${cursor.startedAt}, ${cursor.id})`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const pageResult = await this.db.execute<EventRow>(sql`
      SELECT e.id, e.started_at, e.finished_at, e.missed, e.name, e.description
      FROM events e
      WHERE ${whereClause}
      ORDER BY e.started_at DESC, e.id DESC
      LIMIT ${limitPlusOne}
    `);

    const hasNextPage = pageResult.rows.length > params.limit;
    const pageRows = pageResult.rows.slice(0, params.limit);
    const eventIds = pageRows.map((row) => row.id);

    if (eventIds.length === 0) {
      return { items: [] };
    }

    const [itemsResult, tagsResult, interruptionsResult] = await Promise.all([
      this.db.execute<ItemRow>(sql`
        SELECT id, event_id, type, is_primary
        FROM event_items
        WHERE event_id IN ${eventIds}
        ORDER BY event_id, position
      `),
      this.db.execute<TagRow>(sql`
        SELECT et.event_id, t.name
        FROM event_tags et
        JOIN tags t ON t.id = et.tag_id
        WHERE et.event_id IN ${eventIds}
        ORDER BY et.event_id, t.name
      `),
      this.db.execute<InterruptionRow>(sql`
        SELECT event_id, name, description, started_at, finished_at
        FROM event_interruptions
        WHERE event_id IN ${eventIds}
        ORDER BY event_id, position
      `),
    ]);

    const itemsByEvent = groupBy(itemsResult.rows, (row) => row.event_id);
    const tagsByEvent = groupBy(tagsResult.rows, (row) => row.event_id);
    const interruptionsByEvent = groupBy(interruptionsResult.rows, (row) => row.event_id);

    const items: TimelineEventCardDto[] = pageRows.map((event) => {
      const itemRows = itemsByEvent.get(event.id) ?? [];
      const primaryItem = itemRows.find((row) => row.is_primary);

      return {
        id: event.id,
        primaryItemId: primaryItem?.id ?? "",
        primaryItemType: primaryItem?.type ?? "",
        itemTypes: itemRows.map((row) => row.type),
        missed: event.missed,
        name: event.name,
        description: event.description,
        startedAt: new Date(event.started_at).toISOString(),
        finishedAt: event.finished_at ? new Date(event.finished_at).toISOString() : undefined,
        durationLabel: formatDuration(new Date(event.started_at), event.finished_at ? new Date(event.finished_at) : null),
        tags: (tagsByEvent.get(event.id) ?? []).map((row) => row.name),
        interruptions: (interruptionsByEvent.get(event.id) ?? []).map((row) => ({
          name: row.name,
          description: row.description,
          durationLabel: formatDuration(new Date(row.started_at), new Date(row.finished_at)),
        })),
      };
    });

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeTimelineCursor({ startedAt: new Date(lastRow.started_at), id: lastRow.id })
        : undefined;

    return { items, nextCursor };
  }
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}
