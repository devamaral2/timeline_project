-- Troca o MFA por Twilio (SMS/WhatsApp) por um MFA caseiro: o codigo sai por
-- email, e a conferencia passa a ser local (hash comparado no servico, nao
-- mais delegada a um provedor externo). O convite tambem parou de propor
-- telefone desde a migracao anterior, entao o caminho legado de aceite com
-- OTP por telefone (`invite_acceptance`) nunca mais e usado.

ALTER TABLE mfa_challenges
  ADD COLUMN code_hash text;
UPDATE mfa_challenges SET code_hash = '' WHERE code_hash IS NULL;
ALTER TABLE mfa_challenges
  ALTER COLUMN code_hash SET NOT NULL,
  ADD CONSTRAINT mfa_challenges_code_hash_check CHECK (code_hash <> ''),
  DROP COLUMN requested_channel,
  DROP COLUMN reported_channel,
  DROP COLUMN provider_challenge_id;

ALTER TABLE authentication_attempts DROP CONSTRAINT authentication_attempts_purpose_check;
ALTER TABLE authentication_attempts
  ADD CONSTRAINT authentication_attempts_purpose_check CHECK (purpose IN ('login','password_change','recovery_regeneration')),
  DROP COLUMN invite_id,
  DROP COLUMN proposed_password_hash,
  DROP COLUMN proposed_phone_e164,
  DROP COLUMN proposed_mfa_channel;

ALTER TABLE users
  DROP COLUMN phone_e164,
  DROP COLUMN phone_verified_at,
  DROP COLUMN mfa_channel;

UPDATE auth_schema_meta SET version=5, updated_at=now() WHERE singleton=true AND version<5;
