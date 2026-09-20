import type { AgentChatMessage } from "../../agent-chat/entities/agent-chat-message.entity";
import type { AgentConversation } from "../../agent-chat/entities/agent-conversation.entity";
import type { Event } from "../../events/entities/event.entity";
import type { Note } from "../../notes/entities/note.entity";
import type { Task } from "../../tasks/entities/task.entity";

/** `expectedRevision` e a revisao lida quando a mudanca foi preparada. */
export type StagedChange<T> =
  | { op: "create"; entity: T }
  | { op: "update"; entity: T; expectedRevision: number }
  | { op: "delete"; id: string; expectedRevision: number };

/**
 * O turno de conversa que entra junto das entidades. Vai no mesmo lote de
 * proposito: a conversa nao pode registrar uma gravacao que o banco recusou.
 */
export interface ConversationAppend {
  conversationId: string;
  /** Preenchido so quando a conversa nasce neste turno. */
  create?: AgentConversation;
  /** Na ordem: o pedido do usuario e depois a resposta. `seq` vem da trava. */
  messages: AgentChatMessage[];
}

export interface EntityBatch {
  userId: string;
  events: StagedChange<Event>[];
  tasks: StagedChange<Task>[];
  notes: StagedChange<Note>[];
  conversation?: ConversationAppend;
}

export interface EntityBatchResult {
  /**
   * Onde o turno caiu na conversa. So o banco sabe — o `seq` sai da trava da
   * linha da conversa —, e e o que deixa o cliente notar que outra aba
   * escreveu no meio e recarregar a thread em vez de mentir.
   */
  conversation?: { firstSeq: number; lastSeq: number };
}

/**
 * Grava o lote inteiro numa transacao so. Se qualquer alvo sumiu, mudou de
 * revisao ou nao e do usuario, nada e gravado (`EntityBatchConflictError`) —
 * nem as entidades nem as mensagens do turno.
 */
export interface EntityBatchWriter {
  commit(batch: EntityBatch): Promise<EntityBatchResult>;
}
