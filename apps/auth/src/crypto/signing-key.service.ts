import { randomUUID, type KeyObject } from "node:crypto";
import { decryptSecret, encryptSecret } from "./key-encryption";
import { signJwt, type AccessTokenClaims } from "./jwt";
import type { PublicSigningJwk } from "./jwk";
import type { SigningKeyRepository, StoredSigningKey } from "./ports/signing-key-repository";
import { generateSigningKey, privateKeyFromPem, publicKeyFromJwk } from "./signing-key";

/**
 * Dona das chaves. Assina os access tokens e publica o JWKS que os outros
 * servicos usam para verificar sozinhos.
 *
 * As chaves ficam em memoria depois da primeira leitura: assinar e verificar
 * acontecem em todo request e nao podem custar uma ida ao banco. `reload()`
 * existe para a rotacao — depois de girar a chave, o processo precisa reler.
 */
export class SigningKeyService {
  private activeKey: { kid: string; privateKey: KeyObject } | null = null;
  private publicKeys = new Map<string, KeyObject>();
  private jwks: { keys: PublicSigningJwk[] } = { keys: [] };

  constructor(
    private readonly repository: SigningKeyRepository,
    private readonly keyEncryptionKey: Buffer,
  ) {}

  /**
   * Le as chaves e, se nao houver nenhuma ativa, cria a primeira. O bootstrap
   * automatico evita o passo manual de "gerar a chave" no primeiro deploy, que
   * e onde normalmente alguem acaba commitando uma chave de teste.
   */
  async reload(): Promise<void> {
    let active = await this.repository.findActive();
    if (!active) active = await this.rotate();

    const publishable = await this.repository.listPublishable();

    this.activeKey = {
      kid: active.kid,
      privateKey: privateKeyFromPem(decryptSecret(active.encryptedPrivateKey, this.keyEncryptionKey)),
    };
    this.publicKeys = new Map(
      publishable.map((key) => [key.kid, publicKeyFromJwk(key.publicJwk)] as const),
    );
    this.jwks = { keys: publishable.map((key) => key.publicJwk) };
  }

  /**
   * Gera a chave nova, marca a anterior como `retiring` e volta a ler. A antiga
   * continua no JWKS: os tokens que ela assinou ainda sao validos ate expirar, e
   * derruba-los na hora significaria deslogar todo mundo a cada rotacao.
   */
  async rotate(now: Date = new Date()): Promise<StoredSigningKey> {
    const previous = await this.repository.findActive();
    const material = generateSigningKey();

    const stored: StoredSigningKey = {
      kid: material.kid,
      status: "active",
      publicJwk: material.publicJwk,
      encryptedPrivateKey: encryptSecret(material.privateKeyPem, this.keyEncryptionKey),
      createdAt: now,
      retiredAt: null,
    };
    await this.repository.save(stored);
    if (previous) await this.repository.markStatus(previous.kid, "retiring", now);

    return stored;
  }

  sign(claims: Omit<AccessTokenClaims, "jti">): string {
    if (!this.activeKey) throw new Error("SigningKeyService used before reload()");
    return signJwt({ ...claims, jti: randomUUID() }, this.activeKey);
  }

  /** Passado direto para `verifyJwt`. Devolve null para kid que nao e nosso. */
  resolvePublicKey = (kid: string): KeyObject | null => this.publicKeys.get(kid) ?? null;

  publicJwks(): { keys: PublicSigningJwk[] } {
    return this.jwks;
  }
}
