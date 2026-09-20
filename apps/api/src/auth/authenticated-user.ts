/** Identidade devolvida pelo serviço central de autenticação. */
export interface AuthenticatedUser {
  userId: string;
  email?: string;
  displayName?: string;
  roles?: string[];
  permissions?: string[];
}
