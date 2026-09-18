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
 * Turno anterior da conversa. Quem guarda o historico e o cliente: ele nao da
 * autoridade nenhuma — dono, revisao e usuario sao conferidos no servidor.
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
  history?: AgentChatTurn[];
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
  | "unavailable"
  | "cancelled"
  | "internal";

export type AgentChatServerFrame =
  | { type: "ready"; userId: string; expiresAt: string }
  | { type: "status"; id: string; label: string }
  | ({
      type: "reply";
      id: string;
      /** O resumo que o cliente devolve no `history` deste turno. */
      entities: AgentChatEntityRef[];
    } & RunAgentResponse)
  | { type: "error"; id?: string; code: AgentChatErrorCode };

/**
 * Fechamentos do socket alem dos padrao (1000, 1001): 4401 ticket ausente,
 * invalido, usado ou expirado; 4001 fim da vida da conexao (peca outro
 * ticket); 4002 ociosa. So tipo — contratos nao emitem JS.
 */
export type AgentChatCloseCode = 4401 | 4001 | 4002;
