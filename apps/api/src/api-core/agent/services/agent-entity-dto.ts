import type { Event, Note, Task } from "../../../domain";
import type { AgentEntityItem } from "@repo/contracts";
import { toEventDetailDto as toEventDto } from "../../dto/event-detail.dto";
import { toNoteDto } from "../../dto/note.dto";
import { toTaskDetailDto as toTaskDto } from "../../dto/task-detail.dto";

export { toNoteDto };

/** `notes`: as notes do evento ja carregadas; as que faltarem simplesmente nao aparecem. */
export function eventItem(event: Event, notes: readonly Note[] = []): AgentEntityItem {
  const { kind: eventKind, ...detail } = toEventDto(event, notes);
  return { ...detail, eventKind, kind: "event" };
}

export function taskItem(task: Task): AgentEntityItem {
  return { ...toTaskDto(task), kind: "task" };
}

export function noteItem(note: Note): AgentEntityItem {
  return { ...toNoteDto(note), kind: "note" };
}
