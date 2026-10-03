import type { CreateNoteInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { Note } from "../../domain";
import type { NoteRepository } from "../../domain/ports";
import { assertNoteTargetsOwned, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class CreateNoteUseCase {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly targets: NoteTargetRepositories,
  ) {}

  async execute(input: CreateNoteInput, actor: AuthenticatedUser): Promise<{ noteId: string }> {
    await assertNoteTargetsOwned(input, this.targets, actor.userId);

    const note = Note.create({
      userId: actor.userId,
      content: input.content,
      name: input.name?.trim() || undefined,
      taskId: input.taskId,
      eventId: input.eventId,
      tags: input.tags,
    });

    await this.noteRepository.save(note);
    return { noteId: note.id };
  }
}
