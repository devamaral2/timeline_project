import { encodeTimelineCursor, decodeTimelineCursor } from "@repo/persistence";
import type { TimelineEventQuery, TimelineQueryParams } from "@repo/entities/ports";
import type { TimelineEventCardDto, TimelineEventPageDto } from "@repo/entities/contracts";
import type { Event } from "@repo/entities";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

export class InMemoryTimelineEventQuery implements TimelineEventQuery {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async list(params: TimelineQueryParams): Promise<TimelineEventPageDto> {
    let events = this.database.events.filter((event) => event.userId === params.userId);

    if (params.to) {
      const to = params.to;
      events = events.filter((event) => event.startedAt <= to);
    }
    if (params.from) {
      const from = params.from;
      events = events.filter((event) => (event.finishedAt ?? event.startedAt) >= from);
    }
    if (params.type) {
      const type = params.type;
      events = events.filter((event) => event.items.some((item) => item.type === type));
    }
    if (params.tag) {
      const tag = params.tag;
      events = events.filter((event) => event.tags.includes(tag));
    }

    events = [...events].sort((left, right) => {
      const byStartedAt = right.startedAt.getTime() - left.startedAt.getTime();
      return byStartedAt !== 0 ? byStartedAt : right.id.localeCompare(left.id);
    });

    if (params.cursor) {
      const cursor = decodeTimelineCursor(params.cursor);
      events = events.filter((event) => {
        if (event.startedAt.getTime() !== cursor.startedAt.getTime()) {
          return event.startedAt.getTime() < cursor.startedAt.getTime();
        }
        return event.id < cursor.id;
      });
    }

    const page = events.slice(0, params.limit);
    const hasNextPage = events.length > params.limit;
    const lastEvent = page.at(-1);
    const nextCursor =
      hasNextPage && lastEvent
        ? encodeTimelineCursor({ startedAt: lastEvent.startedAt, id: lastEvent.id })
        : undefined;

    return { items: page.map(toCardDto), nextCursor };
  }
}

function toCardDto(event: Event): TimelineEventCardDto {
  const primaryItem = event.items.find((item) => item.isPrimary);

  return {
    id: event.id,
    primaryItemId: primaryItem?.id ?? "",
    primaryItemType: primaryItem?.type ?? "",
    itemTypes: event.items.map((item) => item.type),
    missed: event.missed,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    durationLabel: formatDuration(event.getDurationMinutes()),
    tags: event.tags,
    interruptions: event.interruptions.map((interruption) => ({
      name: interruption.name,
      description: interruption.description,
      durationLabel: formatDuration(
        Math.round((interruption.finishedAt.getTime() - interruption.startedAt.getTime()) / 60000),
      ),
    })),
  };
}

function formatDuration(durationMinutes: number | null): string {
  if (durationMinutes === null) return "--";
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}
