export interface RefreshToken { id:string; tokenHash:string; sessionId:string; expiresAt:Date; consumedAt:Date|null; successorId:string|null; createdAt:Date; }
