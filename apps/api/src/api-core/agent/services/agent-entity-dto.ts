import type { Event, Note, Task } from "../../../domain";
import type { AgentEntityItem, NoteDto } from "@repo/contracts";
import { toEventDetailDto as toEventDto } from "../../dto/event-detail.dto";
import { toTaskDetailDto as toTaskDto } from "../../dto/task-detail.dto";

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    content: note.content,
    taskId: note.taskId,
    eventId: note.eventId,
    tags: note.tags,
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
