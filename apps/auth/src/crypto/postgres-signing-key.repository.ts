import type { AuthDatabase, AuthTransaction } from '../db/client';
import { SECURITY_POLICY } from '../config/security-policy';
import { isPublicSigningJwk, type PublicSigningJwk } from './jwk';
import type {
  NewStoredSigningKey,
  SigningKeyRepository,
  StoredSigningKey,
} from './ports/signing-key-repository';
import type { SigningKeyForSigning } from '../users/user';

function rowToKey(row: Record<string, unknown>): StoredSigningKey {
  if (!isPublicSigningJwk(row.public_jwk))
    throw new TypeError('Stored signing key has an invalid public JWK');
  return {
    kid: String(row.kid),
    status: row.status as StoredSigningKey['status'],
    publicJwk: row.public_jwk,
    encryptedPrivateKey: row.encrypted_private_key as string | null,
    createdAt: new Date(String(row.created_at)),
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)) : null,
    retireAfter: row.retire_after ? new Date(String(row.retire_after)) : null,
    retiredAt: row.retired_at ? new Date(String(row.retired_at)) : null,
  };
}
export async function lockActiveSigningKey(
  tx: AuthTransaction,
  now: Date,
): Promise<SigningKeyForSigning> {
  await tx.query(
    "SELECT pg_advisory_xact_lock_shared(hashtextextended('timeline-auth:signing-key', 0))",
  );
  const result = await tx.query(
    "SELECT * FROM signing_keys WHERE status = 'active' FOR KEY SHARE",
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.encrypted_private_key !== 'string')
    throw new NoActiveSigningKeyError();
  await tx.query(
    'UPDATE signing_keys SET last_used_at = GREATEST(COALESCE(last_used_at, $2), $2) WHERE kid = $1',
    [row.kid, now],
  );
  return {
    kid: String(row.kid),
    encryptedPrivateKey: row.encrypted_private_key,
  };
}
export class NoActiveSigningKeyError extends Error {}

/**
 * Aposenta de fato as chaves `retiring` cujo `retire_after` ja passou: apaga o
 * material privado e marca `retired`. Roda dentro de toda escrita de chave (boot
 * e rotacao) — foi o que sobrou do job de retencao, que saiu do servico.
 */
async function retireExpiredKeys(tx: AuthTransaction, now: Date): Promise<string[]> {
  const retired = await tx.query<{ kid: string }>(
    "UPDATE signing_keys SET status = 'retired', encrypted_private_key = NULL, retired_at = $1 WHERE status = 'retiring' AND retire_after <= $1 RETURNING kid",
    [now],
  );
  return retired.rows.map((row) => row.kid);
}
export class PostgresSigningKeyRepository implements SigningKeyRepository {
  constructor(private readonly db: AuthDatabase) {}
  ensureActive(
    candidate: NewStoredSigningKey,
    now: Date,
  ): Promise<StoredSigningKey> {
    return this.write(candidate, now, false);
  }
  rotate(
    candidate: NewStoredSigningKey,
    now: Date,
  ): Promise<StoredSigningKey> {
    return this.write(candidate, now, true);
  }
  /**
   * Uma chave `retiring` so e publicada ate `retire_after`. Depois disso ela ja
   * nao pode ter assinado nenhum token vivo, entao sai do JWKS mesmo que
   * ninguem tenha rodado a aposentadoria fisica ainda.
   */
  async listPublishable(): Promise<StoredSigningKey[]> {
    const result = await this.db.query(
      "SELECT * FROM signing_keys WHERE status = 'active' OR (status = 'retiring' AND retire_after > now()) ORDER BY kid",
    );
    return result.rows.map((row) => rowToKey(row as Record<string, unknown>));
  }
  acquireActiveForSigning(now: Date): Promise<SigningKeyForSigning> {
    return this.db.transaction((tx) => lockActiveSigningKey(tx, now));
  }
  retireExpired(now: Date): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('timeline-auth:signing-key', 0))",
      );
      return retireExpiredKeys(tx, now);
    });
  }
  private async write(
    candidate: NewStoredSigningKey,
    now: Date,
    rotate: boolean,
  ): Promise<StoredSigningKey> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('timeline-auth:signing-key', 0))",
      );
      await retireExpiredKeys(tx, now);
      const active = await tx.query(
        "SELECT * FROM signing_keys WHERE status = 'active' FOR UPDATE",
      );
      const existing = active.rows[0] as Record<string, unknown> | undefined;
      if (existing && !rotate) return rowToKey(existing);
      if (existing) {
        const lastUsed = existing.last_used_at
          ? new Date(String(existing.last_used_at)).getTime()
          : now.getTime();
        const retireAfter = new Date(
          Math.max(now.getTime(), lastUsed) +
            SECURITY_POLICY.signingKeyRetireDelaySeconds * 1000,
        );
        await tx.query(
          "UPDATE signing_keys SET status='retiring', retire_after=$2 WHERE kid=$1",
          [existing.kid, retireAfter],
        );
      }
      const inserted = await tx.query(
        "INSERT INTO signing_keys (kid,status,public_jwk,encrypted_private_key,created_at) VALUES ($1,'active',$2,$3,$4) RETURNING *",
        [
          candidate.kid,
          JSON.stringify(candidate.publicJwk),
          candidate.encryptedPrivateKey,
          now,
        ],
      );
      return rowToKey(inserted.rows[0] as Record<string, unknown>);
    });
  }
}
