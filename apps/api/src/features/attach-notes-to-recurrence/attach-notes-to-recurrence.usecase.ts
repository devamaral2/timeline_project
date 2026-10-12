import {
  NoteNotFoundError,
  NoteOwnershipError,
  NoteValidationError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
} from "../../domain";
import type { NoteRepository, RecurrenceRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { todayOf } from "../../api-core/recurrences/recurrence-templates";

/**
 * Liga notes que ja existem a "todas as ocorrencias" de uma serie, de hoje em
 * diante. A mesma note passa a aparecer em cada uma; as ocorrencias passadas e
 * as que o usuario ja editou a mao nao mudam.
 */
export class AttachNotesToRecurrenceUseCase {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly notes: Pick<NoteRepository, "findByIds">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { recurrenceId: string; noteIds: string[] }, actor: AuthenticatedUser): Promise<void> {
    if (!Array.isArray(input.noteIds) || input.noteIds.length === 0 || input.noteIds.some((id) => typeof id !== "string")) {
      throw new NoteValidationError("noteIds must be a non-empty list of note ids");
    }
    const noteIds = [...new Set(input.noteIds)];

    const recurrence = await this.recurrences.findById(input.recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(`Recurrence not found: ${input.recurrenceId}`);
    if (recurrence.userId !== actor.userId) throw new RecurrenceOwnershipError();

    const found = new Map((await this.notes.findByIds(noteIds)).map((note) => [note.id, note]));
    for (const noteId of noteIds) {
      const note = found.get(noteId);
      if (!note) throw new NoteNotFoundError(`Note not found: ${noteId}`);
      if (note.userId !== actor.userId) throw new NoteOwnershipError();
    }

    await this.recurrences.attachNotes(recurrence.id, actor.userId, noteIds, todayOf(recurrence.rule, this.clock()));
  }
}
