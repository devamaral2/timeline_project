/** Quem pediu o ticket, como o `GET /auth/me` do apps/auth o descreveu naquele momento. */
export interface AgentChatActor {
  userId: string;
  roles?: string[];
  permissions?: string[];
  denies?: string[];
}

/** O que uma conexao de chat pode fazer: agir como `actor` sobre os dados de `targetUserId`. */
export interface AgentChatGrant {
  actor: AgentChatActor;
  targetUserId: string;
}

/**
 * Tickets de uso unico que autenticam o upgrade do WebSocket do chat. O
 * navegador nao consegue mandar `Authorization` num `new WebSocket()`: ele
 * pede o ticket por HTTP autenticado e o apresenta na conexao.
 *
 * Guarda so o hash do ticket. Vive fora da memoria do processo porque a API
 * roda com mais de uma replica — o ticket e emitido numa e usado em outra.
 */
export interface AgentChatTicketStore {
  save(input: { tokenHash: string; grant: AgentChatGrant; ttlSeconds: number }): Promise<void>;
  /** Apaga o ticket e devolve o grant; `null` se nao existe, ja foi usado ou expirou. */
  consume(tokenHash: string): Promise<AgentChatGrant | null>;
}
