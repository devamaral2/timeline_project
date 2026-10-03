import type { UpdateNoteInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { NoteNotFoundError, NoteOwnershipError } from "../../domain";
import type { NoteRepository } from "../../domain/ports";
import { assertNoteTargetsOwned, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class UpdateNoteUseCase {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly targets: NoteTargetRepositories,
  ) {}

  async execute(input: UpdateNoteInput, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.noteRepository.findById(input.noteId);
    if (!existing) throw new NoteNotFoundError(`Note not found: ${input.noteId}`);
    if (existing.userId !== actor.userId) throw new NoteOwnershipError();

    await assertNoteTargetsOwned(input, this.targets, actor.userId);

    const revised = existing.revise({
      name: input.name?.trim() || undefined,
      content: input.content,
      taskId: input.taskId,
      eventId: input.eventId,
      tags: input.tags,
    });

    await this.noteRepository.update(revised, actor.userId, input.expectedRevision);
  }
}
