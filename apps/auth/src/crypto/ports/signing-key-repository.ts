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
    audit: AuditEventInput,
  ): Promise<StoredSigningKey>;
  rotate(
    candidate: NewStoredSigningKey,
    now: Date,
    audit: AuditEventInput,
  ): Promise<StoredSigningKey>;
  listPublishable(): Promise<StoredSigningKey[]>;
}
import type { PublicSigningJwk } from '../jwk';
import type { AuditEventInput } from '../../audit/audit-event';
