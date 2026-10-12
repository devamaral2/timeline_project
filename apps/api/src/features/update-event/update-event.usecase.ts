import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { EventNotFoundError, EventOwnershipError } from "../../domain";
import type { EventRepository, NoteRepository } from "../../domain/ports";
import type { UpdateEventInput } from "@repo/contracts";
import { mergeEventUpdate } from "../../api-core/events/services/event-update-merger.service";
import type { NoteBuilder } from "../../api-core/notes/services/note-builder.service";

export class UpdateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly noteRepository: Pick<NoteRepository, "findByIds">,
    private readonly noteBuilder: NoteBuilder,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: UpdateEventInput, actor: AuthenticatedUser): Promise<void> {
    const existingEvent = await this.eventRepository.findById(input.eventId);
    if (!existingEvent) throw new EventNotFoundError(`Event not found: ${input.eventId}`);
    if (existingEvent.userId !== actor.userId) throw new EventOwnershipError();

    const { event, notes } = await mergeEventUpdate(
      existingEvent,
      input,
      { noteBuilder: this.noteBuilder, noteRepository: this.noteRepository },
      this.clock(),
    );
    await this.eventRepository.update(event, actor.userId, input.expectedRevision, notes);
  }
}
