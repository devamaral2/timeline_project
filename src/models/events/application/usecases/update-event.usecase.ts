import type { AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import type { FoodParsingGateway } from "../contracts/food-parsing.gateway";
import type { EventRepository } from "../contracts/event-repository";
import type { TagRepository } from "../contracts/tag-repository";
import type { UpdateEventInput } from "../dtos/update-event.input";
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
