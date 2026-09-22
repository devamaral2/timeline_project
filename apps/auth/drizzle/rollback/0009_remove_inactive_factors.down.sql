-- Restores the schema only. Historical rows must be restored from the backup
-- taken before applying 0009.
CREATE TABLE authentication_attempts (
  id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('login', 'password_change', 'recovery_regeneration')),
  second_factor text NOT NULL CHECK (second_factor IN ('otp', 'recovery')),
  first_methods text[] NOT NULL CHECK (array_length(first_methods, 1) > 0 AND first_methods <@ ARRAY['pwd', 'otp', 'recovery']),
  origin_session_id text, verified_at timestamptz, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, invalidated_at timestamptz, created_at timestamptz NOT NULL
);
CREATE TABLE mfa_challenges (
  id text PRIMARY KEY, attempt_id text NOT NULL REFERENCES authentication_attempts(id),
  check_count integer NOT NULL DEFAULT 0 CHECK (check_count BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL, consumed_at timestamptz, invalidated_at timestamptz,
  created_at timestamptz NOT NULL, code_hash text NOT NULL CHECK (code_hash <> '')
);
CREATE TABLE recovery_codes (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), code_hash text NOT NULL UNIQUE,
  generation integer NOT NULL CHECK (generation > 0), used_at timestamptz,
  revoked_at timestamptz, created_at timestamptz NOT NULL
);
ALTER TABLE rate_limit_buckets DROP CONSTRAINT IF EXISTS rate_limit_buckets_scope_check;
ALTER TABLE rate_limit_buckets ADD CONSTRAINT rate_limit_buckets_scope_check
  CHECK (scope IN ('password_email', 'password_ip', 'mfa_send_user', 'factor_check_attempt'));
UPDATE auth_schema_meta SET version = 5, updated_at = now() WHERE singleton = true;
