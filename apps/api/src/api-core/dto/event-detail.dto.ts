import type { Event } from "../../domain";
import type { EventDetailDto, EventItemDto, KnownEventItemType } from "@repo/contracts";

export function toEventDetailDto(event: Event): EventDetailDto {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    tags: event.tags,
    missed: event.missed,
    priority: event.priority,
    notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
    interruptions: event.interruptions.map((interruption) => ({
      id: interruption.id,
      name: interruption.name,
      description: interruption.description,
      startedAt: interruption.startedAt.toISOString(),
      finishedAt: interruption.finishedAt.toISOString(),
    })),
    revision: event.revision,
    primaryItemId: event.primaryItemId,
    items: event.items.map(
      (item) =>
        ({
          id: item.id,
          position: item.position,
          type: item.type as KnownEventItemType,
          schemaVersion: item.schemaVersion,
          isPrimary: item.isPrimary,
          data: item.data,
        }) as EventItemDto,
    ),
  };
}
