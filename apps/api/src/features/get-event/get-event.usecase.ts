import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { EventOwnershipError } from "../../domain";
import type { EventRepository, NoteRepository } from "../../domain/ports";
import type { EventDetailDto } from "@repo/contracts";
import { toEventDetailDto } from "../../api-core/dto/event-detail.dto";

export class GetEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly noteRepository: Pick<NoteRepository, "findByIds">,
  ) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<EventDetailDto | null> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) return null;
    if (event.userId !== actor.userId) {
      throw new EventOwnershipError();
    }

    const notes = await this.noteRepository.findByIds(event.noteLinks.map((link) => link.noteId));
    return toEventDetailDto(event, notes);
  }
}

export { toEventDetailDto as toDetailDto } from "../../api-core/dto/event-detail.dto";
