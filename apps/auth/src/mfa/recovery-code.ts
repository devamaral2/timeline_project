import { createHash } from "node:crypto";
import type { SecretGenerator } from "../common/secret-generator";
export function normalizeRecoveryCode(code:string):string|null { const value=code.replace(/[ -]/g,"").toUpperCase(); return /^[A-Z2-7]{16}$/.test(value)?value:null; }
export function hashRecoveryCode(code:string):string { return createHash("sha256").update(code).digest("base64url"); }
export interface RecoveryCode { id:string; userId:string; codeHash:string; generation:number; usedAt:Date|null; revokedAt:Date|null; createdAt:Date; }
export interface NewRecoveryCode { id:string;hash:string;generation:number;plainText:string; }
export function generateRecoveryCodes(secrets:SecretGenerator,generation=1):NewRecoveryCode[]{return Array.from({length:10},()=>{const raw=secrets.randomBytes(10).toString("base64").replace(/=/g,"").replace(/\+/g,"A").replace(/\//g,"B").slice(0,16).toUpperCase().replace(/[^A-Z2-7]/g,"A");const canonical=raw.slice(0,16);return{id:secrets.randomId(),hash:hashRecoveryCode(canonical),generation,plainText:canonical.match(/.{1,4}/g)!.join("-")};});}
