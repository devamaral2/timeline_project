import type { PublicSigningJwk } from "../crypto/jwk";
import { InvalidTokenError, verifyJwt, type ClaimsOf, type TokenUse } from "../crypto/jwt";

/**
 * O contrato de verificacao que um servico consumidor aplica aos tokens do auth
 * (TDD §6.4). Nada aqui fala com banco nem com Nest: e o que o `apps/api` adota
 * quando sair do Firebase — ate la nao ha consumidor, e a aplicacao nas rotas de
 * produto fica adiada (RAF-74, RAF-77).
 *
 * Regras:
 * 1. So `token_use` esperado passa. Rota de usuario recusa guest e signup;
 *    refresh nunca aceita JWT algum.
 * 2. Guest so le. A decisao e pelo metodo HTTP, dentro do guard: uma rota de
 *    escrita nova ja nasce fechada para guest, sem ninguem precisar lembrar.
 * 3. O dono dos dados lidos tem de ser `subj`, e `subj` tem de bater com
 *    `users.observes_user_id` relido agora. A claim e cache; a linha e a verdade
 *    — um guest apagado (revogado) deixa de ter linha e cai aqui na hora.
 * 4. (Opcional) `jti` fora de uma lista de revogacao, se ela for adotada.
 */

export const GUEST_READ_METHODS = ["GET", "HEAD", "OPTIONS"] as const;

export type GuestAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "method_not_read" | "subject_mismatch" | "guest_revoked" | "guest_rebound" | "jti_revoked" };

export interface GuestReadRequest {
  claims: ClaimsOf<"guest">;
  method: string;
  /** O usuario dono dos dados que a rota vai devolver. */
  resourceOwnerUserId: string;
  /** `users.observes_user_id` da linha `claims.sub`, lida agora; `null` se a linha nao existe mais. */
  currentObservesUserId: string | null;
  /** So quando a revogacao instantanea por `jti` for adotada. */
  isJtiRevoked?: (jti: string) => boolean;
}

export function authorizeGuestRead(request: GuestReadRequest): GuestAccessDecision {
  if (!(GUEST_READ_METHODS as readonly string[]).includes(request.method.toUpperCase())) return { allowed: false, reason: "method_not_read" };
  if (request.currentObservesUserId === null) return { allowed: false, reason: "guest_revoked" };
  if (request.currentObservesUserId !== request.claims.subj) return { allowed: false, reason: "guest_rebound" };
  if (request.resourceOwnerUserId !== request.claims.subj) return { allowed: false, reason: "subject_mismatch" };
  if (request.isJtiRevoked?.(request.claims.jti)) return { allowed: false, reason: "jti_revoked" };
  return { allowed: true };
}

export type TokenCheck<K extends TokenUse> = { ok: true; claims: ClaimsOf<K> } | { ok: false; reason: string };

/**
 * Regra 1 com o JWKS em cache do consumidor: assinatura, `iss`, `aud`, tempo,
 * forma exata do tipo e `token_use` dentro de `accepted`. Nunca lanca — o
 * consumidor decide o status HTTP.
 */
export function checkToken<K extends TokenUse>(
  token: string,
  jwks: readonly PublicSigningJwk[],
  expected: { issuer: string; audience: string; accepted: readonly K[] },
  now: Date = new Date(),
): TokenCheck<K> {
  try {
    return { ok: true, claims: verifyJwt(token, jwks, expected.issuer, expected.audience, now, expected.accepted) };
  } catch (error) {
    if (error instanceof InvalidTokenError) return { ok: false, reason: error.message };
    throw error;
  }
}
