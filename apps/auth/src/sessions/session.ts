import type { AuthenticationMethod } from "../users/user";
export interface Session { id:string; userId:string; amr:AuthenticationMethod[]; authTime:Date; initialIpAddress:string|null; initialUserAgent:string|null; lastUsedAt:Date; revokedAt:Date|null; endedAt:Date|null; createdAt:Date; }
