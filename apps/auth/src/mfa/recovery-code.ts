import { createHash } from "node:crypto";
import type { SecretGenerator } from "../common/secret-generator";
export function normalizeRecoveryCode(code:string):string|null { const value=code.replace(/[ -]/g,"").toUpperCase(); return /^[A-Z2-7]{16}$/.test(value)?value:null; }
export function hashRecoveryCode(code:string):string { return createHash("sha256").update(code).digest("base64url"); }
export interface RecoveryCode { id:string; userId:string; codeHash:string; generation:number; usedAt:Date|null; revokedAt:Date|null; createdAt:Date; }
export interface NewRecoveryCode { id:string;hash:string;generation:number;plainText:string; }
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, without padding. Ten bytes always become sixteen symbols. */
function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return encoded;
}

export function generateRecoveryCodes(secrets:SecretGenerator,generation=1):NewRecoveryCode[]{return Array.from({length:10},()=>{const canonical=encodeBase32(secrets.randomBytes(10));return{id:secrets.randomId(),hash:hashRecoveryCode(canonical),generation,plainText:canonical.match(/.{4}/g)!.join("-")};});}
