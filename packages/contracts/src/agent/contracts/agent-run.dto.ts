import type { EventDetailDto } from "../../events/contracts/event-detail.dto";
import type { NoteDto } from "../../notes/contracts/note.dto";
import type { TaskDetailDto } from "../../tasks/contracts/task-detail.dto";

/** Tela em que o usuario estava. So ids: o agente busca os dados ele mesmo. */
export interface AgentScreenContext {
  screen: string;
  entityId?: string;
}

export interface RunAgentRequest {
  /** Dono dos dados lidos e alterados. Outro usuario so para super admin. */
  userId: string;
  text: string;
  context?: AgentScreenContext;
}

export type AgentEntityItem =
  | ({ kind: "event" } & EventDetailDto)
  | ({ kind: "task" } & TaskDetailDto)
  | ({ kind: "note" } & NoteDto);

export interface RunAgentResponse {
  agentResponse: string;
  createdEntities: AgentEntityItem[];
  updatedEntities: AgentEntityItem[];
  /** Como estavam antes de apagar. */
  deletedEntities: AgentEntityItem[];
}
