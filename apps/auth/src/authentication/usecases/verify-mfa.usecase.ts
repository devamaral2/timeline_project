import { AuthenticationFailedError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import { hashSecretToken } from "../../crypto/secret-token";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { CompleteLoginUseCase } from "./complete-login.usecase";

/** The public MFA endpoint only completes a password login, never a step-up. */
export class VerifyMfaUseCase {
  constructor(
    private readonly repo: AuthenticationRepository,
    private readonly login: CompleteLoginUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: { mfaToken: string; code: string; context: RequestContext }) {
    const purpose = await this.repo.attemptPurpose(hashSecretToken(input.mfaToken), this.clock.now());
    if (purpose === "login") return this.login.verifyOtp(input);
    throw new AuthenticationFailedError("unknown mfa attempt");
  }
}
