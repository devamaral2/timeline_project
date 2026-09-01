import { createHmac, hkdfSync } from "node:crypto";
import type { RateLimitScope } from "./rate-limiter";
export function deriveRateLimitKey(keyEncryptionKey: Buffer): Buffer { return Buffer.from(hkdfSync("sha256", keyEncryptionKey, Buffer.alloc(0), "timeline-auth-rate-limit", 32)); }
export function rateLimitSubjectHash(key: Buffer, scope: RateLimitScope, normalizedSubject: string): string {
  return createHmac("sha256", key).update(scope).update("\0").update(normalizedSubject).digest("base64url");
}
