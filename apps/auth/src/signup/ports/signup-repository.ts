import type { RequestContext } from "../../common/request-context";
import type { SignAccessToken } from "../../crypto/jwt";
import type { OpenedSession } from "../../sessions/ports/session-repository";

export interface CompleteSignupCommand {
  userId: string;
  tokenJti: string;
  email: string;
  phone: string;
  name: string;
  passwordHash: string;
  session: { id: string; refreshToken: { id: string; hash: string; expiresAt: Date } };
  now: Date;
  context: RequestContext;
}

export type CompleteSignupOutcome =
  | { kind: "completed"; session: OpenedSession }
  /** Token revogado, consumido, vencido ou conta que ja nao esta `pending_sign_up`. */
  | { kind: "invalid" }
  | { kind: "email_taken" }
  | { kind: "phone_taken" };

export interface SignupRepository {
  completeSignup(command: CompleteSignupCommand, sign: SignAccessToken): Promise<CompleteSignupOutcome>;
}
