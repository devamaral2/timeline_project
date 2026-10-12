import type { CreateNoteRequest } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EntityBatchWriter } from "../../domain/ports";
import type { NoteBuilder } from "../../api-core/notes/services/note-builder.service";
import { planNoteLinks, uniqueIds, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class CreateNoteUseCase {
  constructor(
    private readonly noteBuilder: NoteBuilder,
    private readonly targets: NoteTargetRepositories,
    private readonly batchWriter: EntityBatchWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * A note e os alvos a que ela ja nasce ligada entram numa transacao so: ou a
   * note nasce aparecendo onde foi pedido, ou nao nasce.
   */
  async execute(input: CreateNoteRequest, actor: AuthenticatedUser): Promise<{ noteId: string }> {
    const { eventIds, taskIds, ...noteInput } = input;
    const note = await this.noteBuilder.fromCreateInput(noteInput, actor.userId, this.clock());
    const { events, tasks } = await planNoteLinks(
      note.id,
      { eventIds: [], taskIds: [] },
      { eventIds: uniqueIds(eventIds), taskIds: uniqueIds(taskIds) },
      this.targets,
      actor.userId,
    );

    await this.batchWriter.commit({ userId: actor.userId, events, tasks, notes: [{ op: "create", entity: note }] });
    return { noteId: note.id };
  }
}
