/** Resultado de reservar uma chave de idempotencia. */
export type IdempotencyClaim =
  /** Primeira vez (ou reserva abandonada): quem recebeu executa a operacao. */
  | { kind: "claimed" }
  /** A operacao ja terminou: devolver a resposta guardada, sem executar de novo. */
  | { kind: "replay"; response: unknown }
  /** Outra execucao da mesma chave ainda esta em andamento. */
  | { kind: "in_progress" }
  /** A chave ja foi usada com outro corpo de requisicao. */
  | { kind: "mismatch" };

export interface IdempotencyKeyRef {
  userId: string;
  /** Rota protegida (`/api/tasks`): a mesma chave em rotas diferentes e independente. */
  scope: string;
  key: string;
}

/**
 * Chaves de idempotencia das rotas de criacao. A reserva e atomica no banco, entao
 * duas chamadas simultaneas com a mesma chave nunca executam as duas.
 */
export interface IdempotencyStore {
  claim(input: IdempotencyKeyRef & { requestHash: string }): Promise<IdempotencyClaim>;
  /** Guarda a resposta da operacao concluida; chamadas seguintes com a chave a repetem. */
  complete(input: IdempotencyKeyRef & { response: unknown }): Promise<void>;
  /** A operacao falhou: libera a chave para uma nova tentativa. */
  release(input: IdempotencyKeyRef): Promise<void>;
}
