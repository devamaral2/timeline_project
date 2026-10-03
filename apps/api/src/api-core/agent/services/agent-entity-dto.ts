import type { Event, Note, Task } from "../../../domain";
import type { AgentEntityItem } from "@repo/contracts";
import { toNoteDto } from "../../dto/note.dto";
import { toEventDetailDto as toEventDto } from "../../dto/event-detail.dto";
import { toTaskDetailDto as toTaskDto } from "../../dto/task-detail.dto";

export function eventItem(event: Event): AgentEntityItem {
  return { kind: "event", ...toEventDto(event) };
}

export function taskItem(task: Task): AgentEntityItem {
  return { kind: "task", ...toTaskDto(task) };
}

export function noteItem(note: Note): AgentEntityItem {
  return { kind: "note", ...toNoteDto(note) };
}
