import type { Clock } from "../../common/clock";
import { ConflictError, NotFoundError } from "../../common/errors";
import type { SecretGenerator } from "../../common/secret-generator";
import { buildUnsignedSignupTokenClaims, type UnsignedTokenClaims } from "../../crypto/jwt";
import type { SignupTokenRepository } from "../ports/signup-token-repository";
import { signupLink } from "../signup-link";

export interface SignupTokenMinter {
  mintWithActiveKey(claims: UnsignedTokenClaims, now: Date): Promise<{ token: string; jti: string }>;
}

export type CreateSignupLinkInput = { reissueUserId?: string };
export interface SignupLinkOutput { userId: string; link: string; expiresAt: Date; outcome: "created" | "reissued" }

/**
 * Flow 1, passo 1 (TDD §6.1). Cria o placeholder `pending_sign_up` com nome
 * `admin_<hash>` e sem email, telefone ou senha, e emite um JWT `signup` de uma
 * hora cujo `jti` fica em `signup_tokens` — e isso que torna o link revogavel e
 * de uso unico.
 *
 * Reemitir e por id do placeholder, e nao por email: o placeholder nao tem email
 * ate o signup acontecer. Reemitir revoga o link anterior no mesmo commit.
 */
export class CreateSignupLinkUseCase {
  constructor(
    private readonly tokens: SignupTokenRepository,
    private readonly minter: SignupTokenMinter,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly config: { issuer: string; audience: string; webAppUrl: URL },
  ) {}

  async execute(input: CreateSignupLinkInput = {}): Promise<SignupLinkOutput> {
    const now = this.clock.now();
    const userId = input.reissueUserId ?? this.secrets.randomId();
    const claims = buildUnsignedSignupTokenClaims({ iss: this.config.issuer, aud: this.config.audience, sub: userId, now });
    const { token, jti } = await this.minter.mintWithActiveKey(claims, now);
    const expiresAt = new Date(claims.exp * 1000);
    const write = { id: this.secrets.randomId(), jti, expiresAt };

    if (input.reissueUserId) {
      const outcome = await this.tokens.reissue({ userId, token: write, now });
      if (outcome === "not_found") throw new NotFoundError(`no user ${userId}`);
      if (outcome === "not_pending") throw new ConflictError("already_initialized");
      return { userId, link: signupLink(this.config.webAppUrl, token), expiresAt, outcome: "reissued" };
    }

    const placeholderName = `admin_${this.secrets.randomBytes(4).toString("hex")}`;
    await this.tokens.createPendingAdmin({ userId, placeholderName, token: write, now });
    return { userId, link: signupLink(this.config.webAppUrl, token), expiresAt, outcome: "created" };
  }
}
