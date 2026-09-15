/**
 * A chave de assinatura, do jeito que ela mora no banco: publica em claro (ela
 * e publicada no JWKS de qualquer forma) e privada cifrada com a KEK.
 *
 * `status` sustenta a rotacao sem derrubar ninguem:
 * - `active`   — assina os tokens novos. Existe exatamente uma.
 * - `retiring` — ja nao assina, mas continua no JWKS enquanto houver token vivo
 *                assinado por ela (isto e, por um TTL de access token).
 * - `retired`  — sai do JWKS e perde o material privado. A passagem acontece em
 *                toda escrita de chave (boot e rotacao) e pelo CLI
 *                `retire-signing-keys`.
 */
export type SigningKeyStatus = 'active' | 'retiring' | 'retired';

export interface StoredSigningKey {
  kid: string;
  status: SigningKeyStatus;
  publicJwk: PublicSigningJwk;
  encryptedPrivateKey: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  retireAfter: Date | null;
  retiredAt: Date | null;
}

export interface NewStoredSigningKey {
  kid: string;
  publicJwk: PublicSigningJwk;
  encryptedPrivateKey: string;
}
export interface SigningKeyRepository {
  ensureActive(
    candidate: NewStoredSigningKey,
    now: Date,
  ): Promise<StoredSigningKey>;
  rotate(
    candidate: NewStoredSigningKey,
    now: Date,
  ): Promise<StoredSigningKey>;
  listPublishable(): Promise<StoredSigningKey[]>;
  /**
   * A chave ativa pronta para assinar, com `last_used_at` atualizado — e esse
   * campo que a rotacao usa para saber ate quando manter a chave publicada.
   */
  acquireActiveForSigning(now: Date): Promise<SigningKeyForSigning>;
  /** Devolve os `kid` aposentados agora. */
  retireExpired(now: Date): Promise<string[]>;
}
import type { PublicSigningJwk } from '../jwk';
import type { SigningKeyForSigning } from '../../users/user';
