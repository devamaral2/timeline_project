CREATE TABLE IF NOT EXISTS auth_schema_meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
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

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope text NOT NULL CHECK (scope IN ('password_email', 'password_ip', 'mfa_send_user', 'factor_check_attempt')),
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

CREATE TABLE IF NOT EXISTS signing_keys (
  kid text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'retiring', 'retired')),
  public_jwk jsonb NOT NULL,
  encrypted_private_key text,
  created_at timestamptz NOT NULL,
  last_used_at timestamptz,
  retire_after timestamptz,
  retired_at timestamptz,
  CHECK (status <> 'retired' OR encrypted_private_key IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS signing_keys_one_active ON signing_keys (status) WHERE status = 'active';

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

INSERT INTO auth_schema_meta (singleton, version) VALUES (true, 1)
ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, updated_at = now()
WHERE auth_schema_meta.version <> EXCLUDED.version;
