import type { UpdateNoteRequest } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { NoteNotFoundError, NoteOwnershipError, NoteRevisionConflictError } from "../../domain";
import type { EntityBatchWriter, NoteLinkQuery, NoteRepository } from "../../domain/ports";
import type { NoteBuilder } from "../../api-core/notes/services/note-builder.service";
import { planNoteLinks, uniqueIds, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class UpdateNoteUseCase {
  constructor(
    private readonly noteRepository: Pick<NoteRepository, "findById">,
    private readonly linkQuery: NoteLinkQuery,
    private readonly noteBuilder: NoteBuilder,
    private readonly targets: NoteTargetRepositories,
    private readonly batchWriter: EntityBatchWriter,
  ) {}

  /** O conteudo e os vinculos mudam numa transacao so. */
  async execute(input: UpdateNoteRequest, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.noteRepository.findById(input.noteId);
    if (!existing) throw new NoteNotFoundError(`Note not found: ${input.noteId}`);
    if (existing.userId !== actor.userId) throw new NoteOwnershipError();
    if (existing.revision !== input.expectedRevision) {
      throw new NoteRevisionConflictError(
        `Expected revision ${input.expectedRevision} but found ${existing.revision}`,
      );
    }

    const resolved = input.data !== undefined ? await this.noteBuilder.resolveUpdateData(input) : undefined;
    const edits = input.name !== undefined || input.tags !== undefined || resolved !== undefined;
    const revised = edits
      ? existing.revise({
          name: input.name?.trim() || undefined,
          tags: input.tags,
          type: resolved?.type,
          schemaVersion: "schemaVersion" in input ? input.schemaVersion : undefined,
          data: resolved?.data,
        })
      : undefined;

    const links = (await this.linkQuery.linksOf([existing.id])).get(existing.id) ?? [];
    const current = {
      eventIds: links.filter((link) => link.kind === "event").map((link) => link.id),
      taskIds: links.filter((link) => link.kind === "task").map((link) => link.id),
    };
    const desired = {
      eventIds: input.eventIds !== undefined ? uniqueIds(input.eventIds) : current.eventIds,
      taskIds: input.taskIds !== undefined ? uniqueIds(input.taskIds) : current.taskIds,
    };
    const { events, tasks } = await planNoteLinks(existing.id, current, desired, this.targets, actor.userId);

    if (!revised && events.length === 0 && tasks.length === 0) return;
    await this.batchWriter.commit({
      userId: actor.userId,
      events,
      tasks,
      notes: revised ? [{ op: "update", entity: revised, expectedRevision: existing.revision }] : [],
    });
  }
}
