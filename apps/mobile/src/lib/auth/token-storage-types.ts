import type { AuthTokens, AuthUser } from "./auth-client";

/** O que sobrevive ao fechar o app: os dois tokens e quem e o dono deles. */
export interface StoredSession extends AuthTokens {
  user: AuthUser;
}

export interface TokenStorage {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}
