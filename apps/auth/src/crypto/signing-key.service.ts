import { type KeyObject } from 'node:crypto';
import { decryptSecret, encryptSecret } from './key-encryption';
import {
  signJwt,
  type SignAccessToken,
  type UnsignedAccessTokenClaims,
} from './jwt';
import type { PublicSigningJwk } from './jwk';
import type { AuditEventInput } from '../audit/audit-event';
import {
  generateSigningKey,
  privateKeyFromPem,
  publicKeyFromJwk,
} from './signing-key';
import type {
  NewStoredSigningKey,
  SigningKeyRepository,
  StoredSigningKey,
} from './ports/signing-key-repository';
import { SecretGenerator } from '../common/secret-generator';

export class SigningKeyService {
  private privateKeys = new Map<string, KeyObject>();
  private snapshot = new Map<string, PublicSigningJwk>();
  private reloadPromise: Promise<void> | null = null;
  private negativeKids = new Map<string, number>();
  constructor(
    private readonly repository: SigningKeyRepository,
    private readonly kek: Buffer,
    private readonly secretGenerator: SecretGenerator,
  ) {}

  candidate(): NewStoredSigningKey {
    const material = generateSigningKey();
    return {
      kid: material.kid,
      publicJwk: material.publicJwk,
      encryptedPrivateKey: encryptSecret(material.privateKeyPem, this.kek),
    };
  }
  async ensureActive(
    now: Date,
    audit: AuditEventInput,
  ): Promise<StoredSigningKey> {
    const key = await this.repository.ensureActive(
      this.candidate(),
      now,
      audit,
    );
    await this.reload();
    return key;
  }
  async rotate(now: Date, audit: AuditEventInput): Promise<StoredSigningKey> {
    const key = await this.repository.rotate(this.candidate(), now, audit);
    await this.reload();
    return key;
  }
  signAccessToken: SignAccessToken = (key, claims) =>
    signJwt(
      { ...claims, jti: this.secretGenerator.randomId() },
      { kid: key.kid, privateKey: this.privateKeyFor(key) },
    );
  async publicKeyFor(kid: string): Promise<PublicSigningJwk | null> {
    const found = this.snapshot.get(kid);
    if (found) return found;
    const until = this.negativeKids.get(kid);
    if (until && until > Date.now()) return null;
    await this.reload();
    const reloaded = this.snapshot.get(kid) ?? null;
    if (!reloaded) this.negativeKids.set(kid, Date.now() + 5000);
    return reloaded;
  }
  publicJwks(): { keys: PublicSigningJwk[] } {
    return {
      keys: [...this.snapshot.values()].sort((a, b) =>
        a.kid.localeCompare(b.kid),
      ),
    };
  }
  private privateKeyFor(key: {
    kid: string;
    encryptedPrivateKey: string;
  }): KeyObject {
    let cached = this.privateKeys.get(key.kid);
    if (!cached) {
      cached = privateKeyFromPem(
        decryptSecret(key.encryptedPrivateKey, this.kek),
      );
      this.privateKeys.set(key.kid, cached);
    }
    return cached;
  }
  private async reload(): Promise<void> {
    if (!this.reloadPromise)
      this.reloadPromise = this.repository
        .listPublishable()
        .then((keys) => {
          this.snapshot = new Map(keys.map((key) => [key.kid, key.publicJwk]));
          for (const key of keys) this.negativeKids.delete(key.kid);
        })
        .finally(() => {
          this.reloadPromise = null;
        });
    return this.reloadPromise;
  }
}
