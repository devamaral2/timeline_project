/** Identidade devolvida pelo serviço central de autenticação. */
export interface AuthenticatedUser {
  userId: string;
  sessionId?: string;
  email?: string;
  displayName?: string;
}
