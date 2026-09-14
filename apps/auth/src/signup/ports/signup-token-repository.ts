/** O que se grava de um token de signup: nunca o JWT, so o `jti` e a validade. */
export interface SignupTokenWrite { id: string; jti: string; expiresAt: Date }

export interface CreatePendingAdminCommand {
  userId: string;
  /** `admin_<hash>` ate o signup trocar pelo nome real. */
  placeholderName: string;
  token: SignupTokenWrite;
  now: Date;
}

export interface ReissueSignupTokenCommand { userId: string; token: SignupTokenWrite; now: Date }
export type ReissueSignupTokenOutcome = "reissued" | "not_pending" | "not_found";

export interface RevokeSignupTokenCommand { userId: string; now: Date }

/**
 * A linha `pending_sign_up` e o token que autoriza completa-la. Um usuario tem
 * no maximo um token em aberto (indice parcial no banco): reemitir revoga o
 * anterior no mesmo commit em que grava o novo.
 */
export interface SignupTokenRepository {
  createPendingAdmin(command: CreatePendingAdminCommand): Promise<void>;
  reissue(command: ReissueSignupTokenCommand): Promise<ReissueSignupTokenOutcome>;
  /** `true` quando havia token aberto para revogar. */
  revoke(command: RevokeSignupTokenCommand): Promise<boolean>;
}
