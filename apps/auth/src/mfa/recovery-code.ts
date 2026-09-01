import { createHash } from "node:crypto";
export function normalizeRecoveryCode(code:string):string|null { const value=code.replace(/[ -]/g,"").toUpperCase(); return /^[A-Z2-7]{16}$/.test(value)?value:null; }
export function hashRecoveryCode(code:string):string { return createHash("sha256").update(code).digest("base64url"); }
export interface RecoveryCode { id:string; userId:string; codeHash:string; generation:number; usedAt:Date|null; revokedAt:Date|null; createdAt:Date; }
