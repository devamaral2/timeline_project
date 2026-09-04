import { AuthenticationFailedError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import { hashSecretToken } from "../../crypto/secret-token";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { CompleteInviteAcceptanceUseCase } from "./complete-invite-acceptance.usecase";
import type { CompleteLoginUseCase } from "./complete-login.usecase";

/**
 * `POST /auth/mfa/verify` serves two flows that share one attempt token: the
 * invite enrollment and the password login. The attempt row records which one
 * it is, so this reads `purpose` once and hands the token to the use case that
 * owns that flow. The OTP is still checked exactly once, inside that use case.
 */
export class VerifyMfaUseCase {
  constructor(
    private readonly repo: AuthenticationRepository,
    private readonly invite: CompleteInviteAcceptanceUseCase,
    private readonly login: CompleteLoginUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: { mfaToken: string; code: string; context: RequestContext }) {
    const purpose = await this.repo.attemptPurpose(hashSecretToken(input.mfaToken), this.clock.now());
    if (purpose === "invite_acceptance") return this.invite.execute(input);
    if (purpose === "login") return this.login.verifyOtp(input);
    throw new AuthenticationFailedError("unknown mfa attempt");
  }
}
