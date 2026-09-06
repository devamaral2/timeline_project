DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE status = 'active'
      AND (phone_e164 IS NULL OR phone_verified_at IS NULL OR mfa_channel IS NULL)
  ) THEN
    RAISE EXCEPTION 'rollback requires every active user to have a verified MFA phone';
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_active_requires_password;
ALTER TABLE users
  ADD CONSTRAINT users_active_requires_password_and_mfa
  CHECK (status <> 'active' OR (
    password_hash IS NOT NULL
    AND phone_e164 ~ '^\+[1-9][0-9]{1,14}$'
    AND phone_verified_at IS NOT NULL
    AND mfa_channel IS NOT NULL
  ));

UPDATE auth_schema_meta SET version=3, updated_at=now() WHERE singleton=true;
