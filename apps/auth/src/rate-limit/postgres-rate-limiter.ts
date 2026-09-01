import type { RateLimiter, RateLimitScope } from "./rate-limiter";
import { rateLimitSubjectHash } from "./rate-limit-key";

type RateLimitQueryable = { query: <T extends Record<string, unknown>>(text: string, values: readonly unknown[]) => Promise<{ rows: T[] }> };
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: RateLimitQueryable, private readonly key: Buffer) {}
  async hit(input: { scope: RateLimitScope; subject: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const hash = rateLimitSubjectHash(this.key, input.scope, input.subject);
    const result = await this.db.query<{ hit_count: number; window_expires_at: Date }>(`INSERT INTO rate_limit_buckets AS b
      (scope, subject_hash, window_started_at, window_expires_at, hit_count, updated_at)
      VALUES ($1, $2, $3::timestamptz, $3::timestamptz + ($4::int * interval '1 second'), 1, $3::timestamptz)
      ON CONFLICT (scope, subject_hash) DO UPDATE SET
        window_started_at = CASE WHEN b.window_expires_at <= EXCLUDED.updated_at THEN EXCLUDED.window_started_at ELSE b.window_started_at END,
        window_expires_at = CASE WHEN b.window_expires_at <= EXCLUDED.updated_at THEN EXCLUDED.window_expires_at ELSE b.window_expires_at END,
        hit_count = CASE WHEN b.window_expires_at <= EXCLUDED.updated_at THEN 1 ELSE b.hit_count + 1 END,
        updated_at = EXCLUDED.updated_at
      RETURNING hit_count, window_expires_at`, [input.scope, hash, input.now, input.windowSeconds]);
    const bucket = result.rows[0]; const allowed = bucket.hit_count <= input.limit;
    return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.window_expires_at.getTime() - input.now.getTime()) / 1000)) };
  }
}
