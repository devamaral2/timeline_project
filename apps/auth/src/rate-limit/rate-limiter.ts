export type RateLimitScope = "password_email" | "password_ip" | "mfa_send_user" | "factor_check_attempt";
export const RATE_LIMITER = "RATE_LIMITER";
export interface RateLimiter { hit(input: { scope: RateLimitScope; subject: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; retryAfterSeconds: number }>; }
