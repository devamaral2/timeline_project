import type { MfaChannel } from "../users/user";

/**
 * Um desafio de 2FA em aberto. O codigo nunca e guardado em claro: o banco tem
 * o HMAC dele, e a comparacao e feita sobre o hash.
 *
 * `attempts` e contado no servidor, e nao no cliente: e ele que transforma um
 * codigo de 6 digitos (10^6 possibilidades, quebravel em segundos por forca
 * bruta) em algo com 5 chances antes de morrer.
 */
export interface MfaChallenge {
  id: string;
  userId: string;
  /** Liga o desafio ao token intermediario devolvido pelo login. */
  loginAttemptId: string;
  channel: MfaChannel;
  codeHash: string;
  /** Telefone mascarado, para a tela dizer "enviamos para (11) *****-8888". */
  maskedDestination: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export type MfaRejection = "not-found" | "expired" | "consumed" | "too-many-attempts" | "wrong-code";

export function mfaRejection(
  challenge: MfaChallenge | null,
  maxAttempts: number,
  now: Date,
): MfaRejection | null {
  if (!challenge) return "not-found";
  if (challenge.consumedAt !== null) return "consumed";
  if (challenge.expiresAt.getTime() <= now.getTime()) return "expired";
  if (challenge.attempts >= maxAttempts) return "too-many-attempts";
  return null;
}

/**
 * `+5511987654321` vira `+55 11 *****-4321`. O suficiente para o usuario
 * reconhecer o proprio numero sem que a tela revele o numero inteiro de alguem.
 */
export function maskPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 6) return "*".repeat(digits.length);
  const country = digits.slice(0, 2);
  const area = digits.slice(2, 4);
  const last = digits.slice(-4);
  return `+${country} ${area} *****-${last}`;
}
