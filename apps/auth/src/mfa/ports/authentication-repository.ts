import type { AuditEventInput } from "../../audit/audit-event";
import type { MfaChannel } from "../mfa-challenge";
import type { AuthenticationPurpose } from "../authentication-attempt";
export interface StartInviteAttemptCommand { id:string; tokenHash:string; userId:string; inviteId:string; proposedPasswordHash:string; proposedPhoneE164:string; proposedMfaChannel:MfaChannel; challenge:{id:string;providerChallengeId:string;requestedChannel:MfaChannel;reportedChannel:MfaChannel;expiresAt:Date;invalidatedAt:Date|null}; expiresAt:Date; invalidatedAt:Date|null; now:Date;auditEvents:readonly AuditEventInput[]; }
export interface PreparedOtpCheck { attemptId:string;userId:string;purpose:AuthenticationPurpose;challengeId:string;providerChallengeId:string;requestedChannel:MfaChannel;reportedChannel:MfaChannel; }
export interface InvalidateOtpChallengeCommand {attemptId:string;challengeId:string;now:Date;auditEvent:AuditEventInput}
export interface AuthenticationRepository { startInviteAttempt(c:StartInviteAttemptCommand):Promise<"created"|"invalid_invite">; prepareOtpCheck(c:{attemptTokenHash:string;now:Date}):Promise<PreparedOtpCheck|"invalid">; invalidateOtpChallenge(c:InvalidateOtpChallengeCommand):Promise<"invalidated"|"invalid">; }
