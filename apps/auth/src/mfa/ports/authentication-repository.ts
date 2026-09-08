import type { AuditEventInput } from "../../audit/audit-event";
import type { AuthenticationPurpose, SecondFactor, StepUpPurpose } from "../authentication-attempt";
import type { NewRecoveryCode } from "../recovery-code";
import type { NewSessionWrite, ResolvedAccess } from "../../users/user";
import type { SignAccessToken } from "../../crypto/jwt";
export interface NewMfaChallengeWrite {id:string;codeHash:string;expiresAt:Date;invalidatedAt:Date|null}
export interface PreparedOtpCheck {attemptId:string;userId:string;purpose:AuthenticationPurpose;challengeId:string;codeHash:string;}
export interface InvalidateOtpChallengeCommand {attemptId:string;challengeId:string;now:Date;auditEvent:AuditEventInput}
/** O que uma transacao devolve quando emite sessao: nunca o refresh em claro,
 *  que so existe na memoria do usecase que o sorteou. */
export interface SessionCommit {userId:string;sessionId:string;accessToken:string;refreshTokenExpiresAt:Date;access:ResolvedAccess;recoveryCodes?:string[]}
export type EnrollmentCommit = SessionCommit;
export interface StartLoginAttemptCommand {id:string;tokenHash:string;userId:string;secondFactor:SecondFactor;firstMethods:readonly ["pwd"];challenge:NewMfaChallengeWrite|null;expiresAt:Date;invalidatedAt:Date|null;now:Date;auditEvents:readonly AuditEventInput[]}
export interface PreparedMfaResend {attemptId:string;userId:string;email:string}
export interface ReplaceMfaChallengeCommand {attemptId:string;challenge:NewMfaChallengeWrite;now:Date;auditEvents:readonly AuditEventInput[]}
export interface CompleteLoginCommand {recoveryCodes?:readonly NewRecoveryCode[];attemptTokenHash:string;challengeId:string|null;recoveryCodeHash:string|null;newSession:NewSessionWrite;verifiedAt:Date;auditEvents:readonly AuditEventInput[]}
/** Emite sessao para um login sem segundo fator, enquanto a MFA estiver suspensa por env.
 *  Deliberadamente nao toca `authentication_attempts`/`mfa_challenges`: e um caminho
 *  paralelo ao fluxo de MFA, nao uma variacao dele. */
export interface CompleteLoginWithoutMfaCommand {userId:string;newSession:NewSessionWrite;recoveryCodes:readonly NewRecoveryCode[];now:Date;auditEvents:readonly AuditEventInput[]}
export interface StartStepUpAttemptCommand {id:string;tokenHash:string;userId:string;originSessionId:string;purpose:StepUpPurpose;secondFactor:SecondFactor;challenge:NewMfaChallengeWrite|null;expiresAt:Date;invalidatedAt:Date|null;now:Date;auditEvents:readonly AuditEventInput[]}
export interface MarkStepUpVerifiedCommand {attemptTokenHash:string;challengeId:string;verifiedAt:Date;auditEvents:readonly AuditEventInput[]}
export interface VerifyStepUpWithRecoveryCommand {attemptTokenHash:string;recoveryCodeHash:string;verifiedAt:Date;auditEvents:readonly AuditEventInput[]}
export interface ChangePasswordWithStepUpCommand {attemptTokenHash:string;userId:string;originSessionId:string;passwordHash:string;newSession:NewSessionWrite;now:Date;auditEvents:readonly AuditEventInput[]}
export interface RegenerateRecoveryCodesWithStepUpCommand {attemptTokenHash:string;userId:string;originSessionId:string;recoveryCodes:readonly NewRecoveryCode[];now:Date;auditEvents:readonly AuditEventInput[]}
export interface AuthenticationRepository {
  startLoginAttempt(c:StartLoginAttemptCommand):Promise<"created"|"invalid">;
  startStepUpAttempt(c:StartStepUpAttemptCommand):Promise<"created"|"invalid">;
  prepareOtpCheck(c:{attemptTokenHash:string;now:Date}):Promise<PreparedOtpCheck|"invalid">;
  attemptPurpose(attemptTokenHash:string,now:Date):Promise<AuthenticationPurpose|"invalid">;
  prepareMfaResend(attemptTokenHash:string,now:Date):Promise<PreparedMfaResend|"invalid">;
  replaceMfaChallenge(c:ReplaceMfaChallengeCommand):Promise<"replaced"|"invalid">;
  invalidateOtpChallenge(c:InvalidateOtpChallengeCommand):Promise<"invalidated"|"invalid">;
  recordAuditEvent(event:AuditEventInput):Promise<void>;
  markStepUpVerified(c:MarkStepUpVerifiedCommand):Promise<"verified"|"invalid">;
  markStepUpVerifiedWithRecovery(c:VerifyStepUpWithRecoveryCommand):Promise<"verified"|"invalid">;
  completeLogin(c:CompleteLoginCommand,sign:SignAccessToken):Promise<EnrollmentCommit|"invalid">;
  completeLoginWithoutMfa(c:CompleteLoginWithoutMfaCommand,sign:SignAccessToken):Promise<SessionCommit|"invalid">;
  changePasswordWithStepUp(c:ChangePasswordWithStepUpCommand,sign:SignAccessToken):Promise<SessionCommit|"invalid">;
  regenerateRecoveryCodesWithStepUp(c:RegenerateRecoveryCodesWithStepUpCommand):Promise<"regenerated"|"invalid">;
}
