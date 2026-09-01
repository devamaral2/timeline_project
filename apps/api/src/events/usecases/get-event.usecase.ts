import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { EventOwnershipError, type Event } from "@repo/entities";
import type { EventRepository } from "@repo/entities/ports";
import type { EventDetailDto, EventItemDto, KnownEventItemType } from "@repo/entities/contracts";

export class GetEventUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<EventDetailDto | null> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) return null;
    if (event.userId !== actor.userId) {
      throw new EventOwnershipError();
    }

    return toDetailDto(event);
  }
}

function toDetailDto(event: Event): EventDetailDto {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    tags: event.tags,
    missed: event.missed,
    priority: event.priority,
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
