import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { FoodParsingGateway } from "../gateways/food-parsing.gateway";
import type { EventRepository } from "@repo/entities/ports";
import type { TagRepository } from "@repo/entities/ports";
import type { UpdateEventInput } from "@repo/entities/contracts";
import { mergeEventUpdate } from "../services/event-update-merger.service";

export class UpdateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly tagRepository: TagRepository,
    private readonly _foodParsingGateway: FoodParsingGateway,
  ) {}

  async execute(input: UpdateEventInput, actor: AuthenticatedUser): Promise<void> {
    const existingEvent = await this.eventRepository.findById(input.eventId);
    if (!existingEvent) return;
    if (existingEvent.userId !== actor.userId) {
      throw new Error("Only the event owner can modify it");
    }

    const event = mergeEventUpdate(existingEvent, input, new Date());
    await this.eventRepository.update(event, actor.userId);
    await this.tagRepository.upsertMany(event.tags, actor.userId);
  }
}
