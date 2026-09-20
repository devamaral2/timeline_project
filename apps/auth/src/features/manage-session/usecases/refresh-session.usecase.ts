import type { Clock } from "../../../common/clock";
import { AuthenticationFailedError } from "../../../common/errors";
import type { RequestContext } from "../../../common/request-context";
import type { SecretGenerator } from "../../../common/secret-generator";
import { SECURITY_POLICY } from "../../../config/security-policy";
import { hashSecretToken } from "../../authenticate-user/secret-token";
import type { SignAccessToken } from "../../authenticate-user/jwt";
import type { ResolvedAccess } from "../../../domain/users/user";
import type { Session } from "../../../domain/sessions/session";
import type { SessionRepository } from "../ports/session-repository";

export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  session: Session;
  access: ResolvedAccess;
}

/**
 * O segredo do sucessor e sorteado antes de tocar o banco e so sai daqui
 * quando `rotateRefreshToken` commita com `kind: "rotated"` — nos outros dois
 * desfechos (token reusado, token invalido) ele nunca existiu para quem
 * chamou.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sign: SignAccessToken,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
  ) {}

  async execute(input: { refreshToken: string; context: RequestContext }): Promise<RefreshedSession> {
    const now = this.clock.now();
    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const successor = {
      id: this.secrets.randomId(),
      hash: hashSecretToken(refreshToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000),
    };

    const result = await this.sessions.rotateRefreshToken(
      {
        presentedTokenHash: hashSecretToken(input.refreshToken),
        successor,
        now,
        context: input.context,
      },
      this.sign,
    );

    if (result.kind !== "rotated") throw new AuthenticationFailedError(result.kind);

    return {
      accessToken: result.accessToken,
      refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      session: result.session,
      access: result.access,
    };
  }
}
