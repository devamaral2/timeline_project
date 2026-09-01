import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { EventRepository } from "@repo/entities/ports";

export class DeleteEventUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.eventRepository.delete(input.eventId, actor.userId);
  }
}
