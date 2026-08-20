import type { AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import type { DomainEvent, EventRepository } from "../contracts/event-repository";
import type { EventDetailDto } from "../dtos/event-detail.dto";
import { RoutineEvent } from "../../domain/entities/routine-event.entity";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { TrainingEvent } from "../../domain/entities/training-event.entity";

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
