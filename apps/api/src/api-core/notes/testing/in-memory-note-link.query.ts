import type { NoteLinkQuery, NoteLinkSummary } from "../../../domain/ports";
import type { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";
import type { InMemoryTaskRepository } from "../../tasks/testing/in-memory-task.repository";

/** Os vinculos lidos dos mesmos eventos e tarefas em memoria que os repositorios usam. */
export class InMemoryNoteLinkQuery implements NoteLinkQuery {
  constructor(
    private readonly database: InMemoryEventDatabase,
    private readonly tasks: InMemoryTaskRepository,
  ) {}

  async linksOf(noteIds: readonly string[]): Promise<Map<string, NoteLinkSummary[]>> {
    const links = new Map<string, NoteLinkSummary[]>();
    const push = (noteId: string, link: NoteLinkSummary) => links.set(noteId, [...(links.get(noteId) ?? []), link]);

    const events = [...this.database.events].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    for (const event of events) {
      for (const { noteId } of event.noteLinks) {
        if (noteIds.includes(noteId)) {
          push(noteId, { kind: "event", id: event.id, name: event.name, eventKind: event.kind, at: event.startedAt });
        }
      }
    }
    for (const task of this.tasks.all()) {
      for (const { noteId } of task.noteLinks) {
        if (!noteIds.includes(noteId)) continue;
        const at = task.startedAt ?? task.estimatedFinishAt;
        push(noteId, { kind: "task", id: task.id, name: task.name, ...(at ? { at } : {}) });
      }
    }
    return links;
  }
}
