/**
 * A chave de assinatura, do jeito que ela mora no banco: publica em claro (ela
 * e publicada no JWKS de qualquer forma) e privada cifrada com a KEK.
 *
 * `status` sustenta a rotacao sem derrubar ninguem:
 * - `active`   — assina os tokens novos. Existe exatamente uma.
 * - `retiring` — ja nao assina, mas continua no JWKS enquanto houver token vivo
 *                assinado por ela (isto e, por um TTL de access token).
 * - `retired`  — sai do JWKS.
 */
export type SigningKeyStatus = "active" | "retiring" | "retired";

export interface StoredSigningKey {
  kid: string;
  status: SigningKeyStatus;
  publicJwk: PublicSigningJwk;
  encryptedPrivateKey: string;
  createdAt: Date;
  retiredAt: Date | null;
}

export interface SigningKeyRepository {
  findActive(): Promise<StoredSigningKey | null>;
  /** Tudo que ainda pode aparecer no JWKS: `active` + `retiring`. */
  listPublishable(): Promise<StoredSigningKey[]>;
  save(key: StoredSigningKey): Promise<void>;
  markStatus(kid: string, status: SigningKeyStatus, at: Date): Promise<void>;
}
import type { PublicSigningJwk } from "../jwk";
