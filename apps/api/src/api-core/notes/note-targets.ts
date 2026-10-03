import type { NoteLinkDto } from "@repo/contracts";
import {
  EventNotFoundError,
  EventOwnershipError,
  TaskNotFoundError,
  TaskOwnershipError,
  type Note,
} from "../../domain";
import type { EventRepository, TaskRepository } from "../../domain/ports";

export interface NoteTargetRepositories {
  events: Pick<EventRepository, "findById">;
  tasks: Pick<TaskRepository, "findById">;
}

/** O evento e a tarefa a que a nota vai ser presa precisam existir e ser do usuario. */
export async function assertNoteTargetsOwned(
  targets: { eventId?: string | null; taskId?: string | null },
  repositories: NoteTargetRepositories,
  actorUserId: string,
): Promise<void> {
  if (targets.eventId) {
    const event = await repositories.events.findById(targets.eventId);
    if (!event) throw new EventNotFoundError(`Event not found: ${targets.eventId}`);
    if (event.userId !== actorUserId) throw new EventOwnershipError();
  }
  if (targets.taskId) {
    const task = await repositories.tasks.findById(targets.taskId);
    if (!task) throw new TaskNotFoundError(`Task not found: ${targets.taskId}`);
    if (task.userId !== actorUserId) throw new TaskOwnershipError();
  }
}

/**
 * Resolve, para cada nota, o evento ou a tarefa a que ela esta presa. Cada alvo
 * e lido uma vez, mesmo que varias notas apontem para ele. Um alvo que sumiu
 * deixa a nota sem vinculo: ela e do usuario e continua valendo solta.
 */
export async function resolveNoteLinks(
  notes: readonly Note[],
  repositories: NoteTargetRepositories,
): Promise<Map<string, NoteLinkDto>> {
  const eventIds = [...new Set(notes.flatMap((note) => (note.eventId ? [note.eventId] : [])))];
  const taskIds = [...new Set(notes.flatMap((note) => (note.taskId ? [note.taskId] : [])))];

  const [events, tasks] = await Promise.all([
    Promise.all(eventIds.map((id) => repositories.events.findById(id))),
    Promise.all(taskIds.map((id) => repositories.tasks.findById(id))),
  ]);

  const eventLinks = new Map<string, NoteLinkDto>();
  for (const event of events) {
    if (!event) continue;
    const eventType = event.items.find((item) => item.id === event.primaryItemId)?.type;
    eventLinks.set(event.id, {
      kind: "event",
      id: event.id,
      name: event.name,
      ...(eventType ? { eventType } : {}),
      at: event.startedAt.toISOString(),
    });
  }
  const taskLinks = new Map<string, NoteLinkDto>();
  for (const task of tasks) {
    if (!task) continue;
    const at = task.startedAt ?? task.estimatedFinishAt;
    taskLinks.set(task.id, { kind: "task", id: task.id, name: task.name, ...(at ? { at: at.toISOString() } : {}) });
  }

  const links = new Map<string, NoteLinkDto>();
  for (const note of notes) {
    const link = (note.eventId && eventLinks.get(note.eventId)) || (note.taskId && taskLinks.get(note.taskId));
    if (link) links.set(note.id, link);
  }
  return links;
}
