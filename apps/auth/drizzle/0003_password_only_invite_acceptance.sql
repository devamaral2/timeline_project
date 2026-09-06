DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%active%password_hash%phone_e164%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_active_requires_password
  CHECK (status <> 'active' OR password_hash IS NOT NULL);

UPDATE auth_schema_meta SET version=4, updated_at=now() WHERE singleton=true AND version<4;
