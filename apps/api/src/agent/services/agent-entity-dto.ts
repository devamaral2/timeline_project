import type { Event, Note, Task } from "@repo/entities";
import type { AgentEntityItem, NoteDto } from "@repo/entities/contracts";
import { toDetailDto as toEventDto } from "../../events/usecases/get-event.usecase";
import { toDetailDto as toTaskDto } from "../../tasks/usecases/get-task.usecase";

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    content: note.content,
    taskId: note.taskId,
    eventId: note.eventId,
    revision: note.revision,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function eventItem(event: Event): AgentEntityItem {
  return { kind: "event", ...toEventDto(event) };
}

export function taskItem(task: Task): AgentEntityItem {
  return { kind: "task", ...toTaskDto(task) };
}

export function noteItem(note: Note): AgentEntityItem {
  return { kind: "note", ...toNoteDto(note) };
}
