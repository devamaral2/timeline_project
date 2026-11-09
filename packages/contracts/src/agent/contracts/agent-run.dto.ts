import type { EventDetailDto } from "../../events/contracts/event-detail.dto";
import type { EventKind } from "../../events/types/event-kind";
import type { NoteDto } from "../../notes/contracts/note.dto";
import type { TaskDetailDto } from "../../tasks/contracts/task-detail.dto";
import type { AgentChatFieldChange } from "./agent-chat.dto";

/** Tela em que o usuario estava. So ids: o agente busca os dados ele mesmo. */
export interface AgentScreenContext {
  screen: string;
  entityId?: string;
}

/**
 * `kind` aqui e o discriminante da entidade (event | task | note); por isso a
 * natureza do evento (routine, meal...) viaja como `eventKind` nestes itens.
 */
export type AgentEntityItem = (
  | ({ kind: "event"; eventKind: EventKind } & Omit<EventDetailDto, "kind">)
  | ({ kind: "task" } & TaskDetailDto)
  | ({ kind: "note" } & NoteDto)
) & {
  /** Criado ou alterado neste pedido: o que entrou e o que saiu (`AgentChatFieldChange`). */
  changes?: AgentChatFieldChange[];
};
