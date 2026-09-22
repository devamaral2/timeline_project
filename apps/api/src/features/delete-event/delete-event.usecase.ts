import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventRepository } from "../../domain/ports";

export class DeleteEventUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.eventRepository.delete(input.eventId, actor.userId);
  }
}
