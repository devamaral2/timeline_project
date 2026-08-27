import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { EventRepository } from "@repo/entities/ports";

export class DeleteEventUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<void> {
    const existingEvent = await this.eventRepository.findById(input.eventId);
    if (!existingEvent) return;
    if (existingEvent.userId !== actor.userId) {
      throw new Error("Only the event owner can modify it");
    }

    await this.eventRepository.delete(input.eventId, actor.userId);
  }
}
