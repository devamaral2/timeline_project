/** Identidade validada pelo gateway de autenticação antes de chegar à API. */
export interface AuthenticatedUser {
  userId: string;
  sessionId?: string;
  email?: string;
  displayName?: string;
}
