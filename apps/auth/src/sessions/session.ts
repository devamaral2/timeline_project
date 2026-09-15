/** `amr` fica como veio do banco: toda sessao aberta agora e `["pwd"]`. */
export interface Session { id:string; userId:string; amr:string[]; authTime:Date; initialIpAddress:string|null; initialUserAgent:string|null; lastUsedAt:Date; revokedAt:Date|null; endedAt:Date|null; createdAt:Date; }
