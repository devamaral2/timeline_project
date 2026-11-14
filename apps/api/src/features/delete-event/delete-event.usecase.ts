import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventRepository } from "../../domain/ports";

export class DeleteEventUseCase {
  constructor(private readonly eventRepository: Pick<EventRepository, "delete">) {}

  /**
   * Apaga so o evento. As subtarefas dele continuam existindo: subtarefa e uma
   * relacao, e pode pertencer a outro evento maior.
   */
  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.eventRepository.delete(input.eventId, actor.userId);
  }
}
