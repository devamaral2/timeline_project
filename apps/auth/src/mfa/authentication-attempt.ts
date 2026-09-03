import type { AuthenticationMethod } from "../users/user";
import type { MfaChannel } from "./mfa-challenge";
export type SecondFactor="otp"|"recovery";
export type AuthenticationPurpose="invite_acceptance"|"login"|"password_change"|"recovery_regeneration";
export interface AuthenticationAttempt { id:string; tokenHash:string; userId:string; purpose:AuthenticationPurpose; secondFactor:SecondFactor; firstMethods:AuthenticationMethod[]; inviteId:string|null; originSessionId:string|null; proposedPasswordHash:string|null; proposedPhoneE164:string|null; proposedMfaChannel:MfaChannel|null; verifiedAt:Date|null; expiresAt:Date; consumedAt:Date|null; invalidatedAt:Date|null; createdAt:Date; }
