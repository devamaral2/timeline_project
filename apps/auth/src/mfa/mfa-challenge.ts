export interface MfaChallenge { id:string; attemptId:string; codeHash:string; checkCount:number; expiresAt:Date; consumedAt:Date|null; invalidatedAt:Date|null; createdAt:Date; }

/** Legacy transport types used only by the standalone Twilio smoke tool. */
export type MfaChannel = "sms" | "whatsapp";
export function maskEmail(email:string):string {
  const [local, domain] = email.split("@");
  return local && domain ? `${[...local][0]}***@${domain}` : "***";
}
