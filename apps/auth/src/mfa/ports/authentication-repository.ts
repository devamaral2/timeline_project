import type { AuditEventInput } from "../../audit/audit-event";
import type { MfaChannel } from "../mfa-challenge";
import type { AuthenticationPurpose } from "../authentication-attempt";
import type { NewRecoveryCode } from "../recovery-code";
import type { NewSessionWrite, ResolvedAccess } from "../../users/user";
import type { SignAccessToken } from "../../crypto/jwt";
export interface StartInviteAttemptCommand { id:string; tokenHash:string; userId:string; inviteId:string; proposedPasswordHash:string; proposedPhoneE164:string; proposedMfaChannel:MfaChannel; challenge:{id:string;providerChallengeId:string;requestedChannel:MfaChannel;reportedChannel:MfaChannel;expiresAt:Date;invalidatedAt:Date|null}; expiresAt:Date; invalidatedAt:Date|null; now:Date;auditEvents:readonly AuditEventInput[]; }
export interface PreparedOtpCheck { attemptId:string;userId:string;purpose:AuthenticationPurpose;challengeId:string;providerChallengeId:string;requestedChannel:MfaChannel;reportedChannel:MfaChannel; }
export interface InvalidateOtpChallengeCommand {attemptId:string;challengeId:string;now:Date;auditEvent:AuditEventInput}
export interface EnrollmentCommit {userId:string;sessionId:string;accessToken:string;refreshTokenExpiresAt:Date;access:ResolvedAccess}
export interface CompleteInviteEnrollmentCommand {attemptTokenHash:string;challengeId:string;recoveryCodes:readonly NewRecoveryCode[];newSession:NewSessionWrite;verifiedAt:Date;context:import("../../common/request-context").RequestContext;auditEvents:readonly AuditEventInput[]}
export interface AuthenticationRepository { startInviteAttempt(c:StartInviteAttemptCommand):Promise<"created"|"invalid_invite">; prepareOtpCheck(c:{attemptTokenHash:string;now:Date}):Promise<PreparedOtpCheck|"invalid">; invalidateOtpChallenge(c:InvalidateOtpChallengeCommand):Promise<"invalidated"|"invalid">; completeInviteEnrollment(c:CompleteInviteEnrollmentCommand,sign:SignAccessToken):Promise<EnrollmentCommit|"invalid">; }
