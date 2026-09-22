-- Historical MFA/recovery records are retired after a verified database backup.
-- Sessions and refresh tokens remain intact, including historical amr claims.
DROP TABLE IF EXISTS mfa_challenges;
DROP TABLE IF EXISTS authentication_attempts;
DROP TABLE IF EXISTS recovery_codes;

DELETE FROM rate_limit_buckets WHERE scope IN ('mfa_send_user', 'factor_check_attempt');
ALTER TABLE rate_limit_buckets DROP CONSTRAINT IF EXISTS rate_limit_buckets_scope_check;
ALTER TABLE rate_limit_buckets ADD CONSTRAINT rate_limit_buckets_scope_check
  CHECK (scope IN ('password_email', 'password_ip'));

UPDATE auth_schema_meta SET version = 6, updated_at = now() WHERE singleton = true;
