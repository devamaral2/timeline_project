import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Segredos opacos — refresh token, token de convite, `state` do OAuth, token de
 * 2FA intermediario. Todos seguem a mesma regra: o banco guarda so o hash.
 *
 * Diferente da senha, aqui o hash e SHA-256 puro, sem custo. Pode: sao 256 bits
 * de entropia vinda de `randomBytes`, entao nao ha dicionario para percorrer — o
 * hash existe para que um dump do banco nao contenha credencial usavel, e nao
 * para resistir a forca bruta. E a busca por refresh token acontece em todo
 * refresh: um KDF caro ali viraria gargalo.
 */
export function generateSecretToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecretToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** Comparacao de tempo constante: evita descobrir o segredo byte a byte. */
export function secretTokensMatch(candidateHash: string, storedHash: string): boolean {
  const candidate = Buffer.from(candidateHash);
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/**
 * Codigo de 2FA: 6 digitos, sorteados com `randomInt` (CSPRNG) e nao com
 * `Math.random`. Zeros a esquerda sao preservados — `002914` e um codigo valido,
 * e cortar o zero encolheria o espaco de busca.
 */
export function generateOtpCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}
