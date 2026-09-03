import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { EventNotFoundError, EventOwnershipError } from "@repo/entities";
import type { EventRepository, WorkoutCatalog } from "@repo/entities/ports";
import type { UpdateEventInput } from "@repo/entities/contracts";
import { mergeEventUpdate } from "../services/event-update-merger.service";

export class UpdateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly workoutCatalog: WorkoutCatalog,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: UpdateEventInput, actor: AuthenticatedUser): Promise<void> {
    const existingEvent = await this.eventRepository.findById(input.eventId);
    if (!existingEvent) throw new EventNotFoundError(`Event not found: ${input.eventId}`);
    if (existingEvent.userId !== actor.userId) throw new EventOwnershipError();

    const revisedEvent = await mergeEventUpdate(existingEvent, input, this.workoutCatalog, this.clock());
    await this.eventRepository.update(revisedEvent, actor.userId, input.expectedRevision);
  }
}
