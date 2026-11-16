import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { EventNotFoundError, EventOwnershipError, EventRevisionConflictError } from "../../domain";
import type { ArtifactRepository, EntityBatchWriter, EventRepository } from "../../domain/ports";
import type { UpdateTaskInput } from "@repo/contracts";
import type { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { mergeEventUpdate, toUpdateBatch } from "../../api-core/events/services/event-update-merger.service";

export class UpdateEventUseCase {
  constructor(
    private readonly eventRepository: Pick<EventRepository, "findById" | "findByIds">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly batchWriter: EntityBatchWriter,
  ) {}

  /** O evento, os artefatos editados e os eventos de origem das relacoes mudam numa transacao so. */
  async execute(input: UpdateTaskInput, actor: AuthenticatedUser): Promise<void> {
    const existingEvent = await this.eventRepository.findById(input.taskId);
    if (!existingEvent) throw new EventNotFoundError(`Event not found: ${input.taskId}`);
    if (existingEvent.userId !== actor.userId) throw new EventOwnershipError();
    if (existingEvent.revision !== input.expectedRevision) {
      throw new EventRevisionConflictError(
        `Expected revision ${input.expectedRevision} but found ${existingEvent.revision}`,
      );
    }

    const merged = await mergeEventUpdate(existingEvent, input, {
      artifactBuilder: this.artifactBuilder,
      artifactRepository: this.artifactRepository,
      eventRepository: this.eventRepository,
    });
    await this.batchWriter.commit(toUpdateBatch(merged, input.expectedRevision));
  }
}
