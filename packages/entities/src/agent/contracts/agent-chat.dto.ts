import type { AgentScreenContext, RunAgentResponse } from "./agent-run.dto";

/** `POST /api/ai/chat/tickets` — para quem o chat vai agir. */
export interface IssueAgentChatTicketRequest {
  userId: string;
}

export interface AgentChatTicketDto {
  /** Uso unico: vai em `?ticket=` no upgrade de `/api/ai/chat`. */
  ticket: string;
  expiresAt: string;
}

/** Um registro que uma resposta anterior tocou, para o agente saber de quem "ela" fala. */
export interface AgentChatEntityRef {
  kind: "event" | "task" | "note";
  id: string;
  change: "created" | "updated" | "deleted";
  label?: string;
}

/**
 * Turno anterior da conversa, como o servidor o le do banco para montar o
 * prompt. **Nao trafega**: o historico deixou de ser do cliente, e o que vai
 * no frame e so o id da conversa.
 */
export interface AgentChatTurn {
  role: "user" | "assistant";
  text: string;
  entities?: AgentChatEntityRef[];
}

export interface AgentChatMessageFrame {
  type: "message";
  /** Gerado pelo cliente; volta em todo frame sobre esta mensagem. */
  id: string;
  text: string;
  context?: AgentScreenContext;
  /**
   * A conversa em que a mensagem entra. Ausente e conversa nova — ela nasce
   * na transacao de commit, entao um turno que falha nao deixa conversa vazia.
   */
  conversationId?: string;
}

export interface AgentChatCancelFrame {
  type: "cancel";
  id: string;
}

export type AgentChatClientFrame = AgentChatMessageFrame | AgentChatCancelFrame;

export type AgentChatErrorCode =
  | "invalid_frame"
  | "busy"
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  /** A conversa nao existe, foi apagada ou nao e do usuario: comece outra. */
  | "conversation_gone"
  | "unavailable"
  | "cancelled"
  | "internal";

export type AgentChatServerFrame =
  | { type: "ready"; userId: string; expiresAt: string }
  | { type: "status"; id: string; label: string }
  | ({
      type: "reply";
      id: string;
      /** A conversa do turno — o cliente adota o id quando ela acabou de nascer. */
      conversationId: string;
      /**
       * Onde a resposta caiu na conversa. Um salto em relacao ao que o cliente
       * tem e sinal de que outra aba escreveu no meio: recarregue a thread.
       */
      assistantSeq: number;
      /** O resumo dos registros que esta resposta tocou. */
      entities: AgentChatEntityRef[];
    } & RunAgentResponse)
  | { type: "error"; id?: string; code: AgentChatErrorCode };

/**
 * Fechamentos do socket alem dos padrao (1000, 1001): 4401 ticket ausente,
 * invalido, usado ou expirado; 4001 fim da vida da conexao (peca outro
 * ticket); 4002 ociosa. So tipo — contratos nao emitem JS.
 */
export type AgentChatCloseCode = 4401 | 4001 | 4002;
