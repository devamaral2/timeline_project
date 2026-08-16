import type { AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import type { FoodParsingGateway } from "../contracts/food-parsing.gateway";
import type { EventRepository, DomainEvent } from "../contracts/event-repository";
import type { TagRepository } from "../contracts/tag-repository";
import type { CreateEventInput, NonFoodCreateEventInput } from "../dtos/create-event.input";
import { RoutineEvent } from "../../domain/entities/routine-event.entity";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { TrainingEvent } from "../../domain/entities/training-event.entity";
import { Interruption } from "../../domain/value-objects/interruption";

export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly tagRepository: TagRepository,
    private readonly foodParsingGateway: FoodParsingGateway,
  ) {}

  async execute(input: CreateEventInput, actor: AuthenticatedUser): Promise<{ eventId: string }> {
    if (input.type === "food") {
      throw new Error("food events require the parsing gateway and are temporarily disabled");
    }

    const event = createDomainEventFromInput(input, actor.userId);
    await this.eventRepository.save(event);
    await this.tagRepository.upsertMany(event.tags, actor.userId);
    return { eventId: event.id };
  }
}

export function createDomainEventFromInput(input: NonFoodCreateEventInput, userId: string): DomainEvent {
  const common = {
    id: input.eventId,
    userId,
    name: input.name,
    description: input.description,
    startedAt: new Date(input.startedAt),
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
    tags: input.tags,
    interruptions: input.interruptions.map((interruption) =>
      Interruption.create({
        ...interruption,
        startedAt: new Date(interruption.startedAt),
        finishedAt: new Date(interruption.finishedAt),
      }),
    ),
  };

  switch (input.type) {
    case "routine":
      return RoutineEvent.create({ ...common, data: input.data ?? {} });
    case "training":
      return TrainingEvent.create({ ...common, data: input.data });
    case "sleep":
      return SleepEvent.create({ ...common, data: input.data });
  }
}
