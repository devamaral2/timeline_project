import type { AuthenticationMethod } from "../users/user";
import type { MfaChannel } from "./mfa-challenge";
export type SecondFactor="otp"|"recovery";
export type AuthenticationPurpose="invite_acceptance"|"login"|"password_change"|"recovery_regeneration";
export interface AuthenticationAttempt { id:string; tokenHash:string; userId:string; purpose:AuthenticationPurpose; secondFactor:SecondFactor; firstMethods:AuthenticationMethod[]; inviteId:string|null; originSessionId:string|null; proposedPasswordHash:string|null; proposedPhoneE164:string|null; proposedMfaChannel:MfaChannel|null; verifiedAt:Date|null; expiresAt:Date; consumedAt:Date|null; invalidatedAt:Date|null; createdAt:Date; }
/** Os dois purposes que um step-up autoriza. O convite e o login nascem de
 *  outra porta, e nunca podem ser consumidos por `/auth/password/change` nem
 *  por `/auth/recovery-codes/regenerate`. */
export type StepUpPurpose = Extract<AuthenticationPurpose, "password_change" | "recovery_regeneration">;
export const STEP_UP_PURPOSES: readonly StepUpPurpose[] = ["password_change", "recovery_regeneration"];
export function isStepUpPurpose(value: string): value is StepUpPurpose { return (STEP_UP_PURPOSES as readonly string[]).includes(value); }
