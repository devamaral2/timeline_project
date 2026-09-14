-- Recria as tabelas vazias, na forma que tinham depois da 0004. O conteudo
-- apagado nao volta.

CREATE TABLE audit_log (
  id text PRIMARY KEY,
  correlation_id text NOT NULL,
  actor_user_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  result text NOT NULL CHECK (result IN ('succeeded', 'failed')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE TABLE authentication_attempts (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id),
  purpose text NOT NULL CONSTRAINT authentication_attempts_purpose_check CHECK (purpose IN ('login','password_change','recovery_regeneration')),
  second_factor text NOT NULL CHECK (second_factor IN ('otp','recovery')),
  first_methods text[] NOT NULL CHECK (array_length(first_methods,1)>0 AND first_methods <@ ARRAY['pwd','otp','recovery']),
  origin_session_id text,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE mfa_challenges (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES authentication_attempts(id),
  check_count integer NOT NULL DEFAULT 0 CHECK (check_count BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL,
  code_hash text NOT NULL CONSTRAINT mfa_challenges_code_hash_check CHECK (code_hash <> '')
);

CREATE TABLE recovery_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  code_hash text NOT NULL UNIQUE,
  generation integer NOT NULL CHECK (generation > 0),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);

UPDATE auth_schema_meta SET version = 6, updated_at = now() WHERE singleton = true;
