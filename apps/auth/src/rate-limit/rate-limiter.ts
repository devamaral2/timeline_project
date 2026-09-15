export type RateLimitScope = "login_email" | "login_ip" | "signup_ip" | "guest_issuer";
export const RATE_LIMITER = "RATE_LIMITER";
export interface RateLimiter { hit(input: { scope: RateLimitScope; subject: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; retryAfterSeconds: number }>; }
