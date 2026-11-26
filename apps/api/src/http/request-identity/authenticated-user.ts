/** Identidade validada pelo gateway de autenticação antes de chegar à API. */
export interface AuthenticatedUser {
  userId: string;
  sessionId?: string;
  /** Só a chave de dispositivo do serviço local traz permissões; uma sessão comum não. */
  permissions?: readonly string[];
  email?: string;
  displayName?: string;
}
