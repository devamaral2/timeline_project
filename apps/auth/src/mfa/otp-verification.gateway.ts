import type { MfaChannel } from "./mfa-challenge";
export const OTP_VERIFICATION_GATEWAY = Symbol("OTP_VERIFICATION_GATEWAY");
export interface OtpVerificationGateway { start(input:{phoneE164:string;channel:MfaChannel}):Promise<{providerChallengeId:string;reportedChannel:MfaChannel}>; check(input:{providerChallengeId:string;code:string}):Promise<{approved:boolean;reportedChannel:MfaChannel}>; }
