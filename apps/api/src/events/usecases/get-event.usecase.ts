import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { DomainEvent, EventRepository } from "@repo/entities/ports";
import type { EventDetailDto } from "@repo/entities/contracts";
import { RoutineEvent } from "@repo/entities";
import { SleepEvent } from "@repo/entities";
import { TrainingEvent } from "@repo/entities";

export class GetEventUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<EventDetailDto | null> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) return null;
    if (event.userId !== actor.userId) {
      throw new Error("Only the event owner can modify it");
    }

    return toDetailDto(event);
  }
}

function toDetailDto(event: DomainEvent): EventDetailDto {
  const common = {
    id: event.id,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    tags: event.tags,
    interruptions: event.interruptions.map((interruption) => ({
      id: interruption.id,
      name: interruption.name,
      description: interruption.description,
      startedAt: interruption.startedAt.toISOString(),
      finishedAt: interruption.finishedAt.toISOString(),
    })),
  };

  if (event instanceof RoutineEvent) return { type: "routine", ...common };
  if (event instanceof SleepEvent) return { type: "sleep", ...common, data: event.data };
  if (event instanceof TrainingEvent) return { type: "training", ...common, data: { workouts: event.data.workouts } };
  return { type: "food", ...common, data: { items: event.data.items } };
}
