import type { AuditEventInput } from "../../audit/audit-event";
import type { SignAccessToken } from "../../crypto/jwt";
import type { NewSessionWrite, ResolvedAccess } from "../../users/user";

export interface SessionCommit {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshTokenExpiresAt: Date;
  access: ResolvedAccess;
}

export interface CompleteLoginCommand {
  userId: string;
  newSession: NewSessionWrite;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface AuthenticationRepository {
  completeLogin(command: CompleteLoginCommand, sign: SignAccessToken): Promise<SessionCommit | "invalid">;
}
