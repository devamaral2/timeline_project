import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { EventNotFoundError, EventOwnershipError } from "../../domain";
import type { EventCardQuery, EventRepository } from "../../domain/ports";
import type { EventCardDto } from "@repo/contracts";
import { toEventCardDto } from "../../api-core/dto/event.dto";

/** Os eventos em que um evento maior se desdobra: so o primeiro nivel. */
export class ListSubtasksUseCase {
  constructor(
    private readonly eventRepository: Pick<EventRepository, "findById">,
    private readonly eventCardQuery: Pick<EventCardQuery, "subtasks">,
  ) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<EventCardDto[]> {
    const parent = await this.eventRepository.findById(input.eventId);
    if (!parent) throw new EventNotFoundError(`Event not found: ${input.eventId}`);
    if (parent.userId !== actor.userId) throw new EventOwnershipError();

    const cards = await this.eventCardQuery.subtasks({ userId: actor.userId, parentEventId: parent.id });
    return cards.map(toEventCardDto);
  }
}
