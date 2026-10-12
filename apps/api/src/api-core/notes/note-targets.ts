import {
  EventNotFoundError,
  EventOwnershipError,
  TaskNotFoundError,
  TaskOwnershipError,
  type Event,
  type Task,
} from "../../domain";
import type { EventRepository, StagedChange, TaskRepository } from "../../domain/ports";

export interface NoteTargetRepositories {
  events: Pick<EventRepository, "findById">;
  tasks: Pick<TaskRepository, "findById">;
}

/** Os ids de eventos e tarefas em que uma note aparece. */
export interface NoteTargetIds {
  eventIds: readonly string[];
  taskIds: readonly string[];
}

async function loadOwnedEvents(ids: readonly string[], repositories: NoteTargetRepositories, actorUserId: string) {
  return Promise.all(
    ids.map(async (id) => {
      const event = await repositories.events.findById(id);
      if (!event) throw new EventNotFoundError(`Event not found: ${id}`);
      if (event.userId !== actorUserId) throw new EventOwnershipError();
      return event;
    }),
  );
}

async function loadOwnedTasks(ids: readonly string[], repositories: NoteTargetRepositories, actorUserId: string) {
  return Promise.all(
    ids.map(async (id) => {
      const task = await repositories.tasks.findById(id);
      if (!task) throw new TaskNotFoundError(`Task not found: ${id}`);
      if (task.userId !== actorUserId) throw new TaskOwnershipError();
      return task;
    }),
  );
}

/**
 * As mudancas em eventos e tarefas que fazem a note aparecer exatamente nos
 * alvos `desired`, dado onde ela aparece hoje (`current`). Quem entra a recebe
 * no fim da lista; quem sai perde o vinculo. Todo alvo tocado precisa existir e
 * ser do usuario. Editar o vinculo e editar o evento ou a tarefa: uma ocorrencia
 * de serie que ganha ou perde uma note por aqui passa a ser so dela.
 */
export async function planNoteLinks(
  noteId: string,
  current: NoteTargetIds,
  desired: NoteTargetIds,
  repositories: NoteTargetRepositories,
  actorUserId: string,
): Promise<{ events: StagedChange<Event>[]; tasks: StagedChange<Task>[] }> {
  const addedEvents = desired.eventIds.filter((id) => !current.eventIds.includes(id));
  const removedEvents = current.eventIds.filter((id) => !desired.eventIds.includes(id));
  const addedTasks = desired.taskIds.filter((id) => !current.taskIds.includes(id));
  const removedTasks = current.taskIds.filter((id) => !desired.taskIds.includes(id));

  const [events, tasks] = await Promise.all([
    loadOwnedEvents([...addedEvents, ...removedEvents], repositories, actorUserId),
    loadOwnedTasks([...addedTasks, ...removedTasks], repositories, actorUserId),
  ]);

  return {
    events: events.map((event) => {
      const noteLinks = addedEvents.includes(event.id)
        ? [...event.noteLinks, { noteId, fromRecurrence: false }]
        : event.noteLinks.filter((link) => link.noteId !== noteId);
      return { op: "update", entity: event.revise({ noteLinks }), expectedRevision: event.revision };
    }),
    tasks: tasks.map((task) => {
      const noteLinks = addedTasks.includes(task.id)
        ? [...task.noteLinks, { noteId, fromRecurrence: false }]
        : task.noteLinks.filter((link) => link.noteId !== noteId);
      return { op: "update", entity: task.revise({ noteLinks }), expectedRevision: task.revision };
    }),
  };
}

export function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}
