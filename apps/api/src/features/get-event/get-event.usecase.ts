import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { EventOwnershipError } from "../../domain";
import type { ArtifactRepository, EventRepository, RecurrenceRepository } from "../../domain/ports";
import type { EventDto } from "@repo/contracts";
import { toEventDto } from "../../api-core/dto/event.dto";

export class GetEventUseCase {
  constructor(
    private readonly eventRepository: Pick<EventRepository, "findById">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly recurrenceRepository: Pick<RecurrenceRepository, "findById">,
  ) {}

  async execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<EventDto | null> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) return null;
    if (event.userId !== actor.userId) {
      throw new EventOwnershipError();
    }

    const [artifacts, recurrence] = await Promise.all([
      this.artifactRepository.findByIds(event.artifactLinks.map((link) => link.artifactId)),
      event.occurrence ? this.recurrenceRepository.findById(event.occurrence.recurrenceId) : null,
    ]);
    return toEventDto(event, artifacts, recurrence ?? undefined);
  }
}
