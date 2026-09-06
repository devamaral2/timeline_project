-- Reverte a forma do schema para o MFA por telefone/Twilio. Os dados que a
-- migracao para frente apagou (telefones, canais, provider_challenge_id) nao
-- voltam -- nao ha como recupera-los -- entao as colunas restauradas ficam
-- nulas ate um novo aceite de convite ou reenvio de OTP preenche-las de novo.

ALTER TABLE users
  ADD COLUMN phone_e164 text,
  ADD COLUMN phone_verified_at timestamptz,
  ADD COLUMN mfa_channel text;

ALTER TABLE authentication_attempts
  ADD COLUMN invite_id text REFERENCES invites(id),
  ADD COLUMN proposed_password_hash text,
  ADD COLUMN proposed_phone_e164 text,
  ADD COLUMN proposed_mfa_channel text CHECK(proposed_mfa_channel IS NULL OR proposed_mfa_channel IN ('sms','whatsapp'));
ALTER TABLE authentication_attempts DROP CONSTRAINT authentication_attempts_purpose_check;
ALTER TABLE authentication_attempts
  ADD CONSTRAINT authentication_attempts_purpose_check CHECK (purpose IN ('invite_acceptance','login','password_change','recovery_regeneration'));

ALTER TABLE mfa_challenges
  ADD COLUMN requested_channel text,
  ADD COLUMN reported_channel text,
  ADD COLUMN provider_challenge_id text;
UPDATE mfa_challenges SET requested_channel = 'sms', reported_channel = 'sms', provider_challenge_id = 'rolled-back' WHERE provider_challenge_id IS NULL;
ALTER TABLE mfa_challenges
  ALTER COLUMN requested_channel SET NOT NULL,
  ALTER COLUMN reported_channel SET NOT NULL,
  ALTER COLUMN provider_challenge_id SET NOT NULL,
  ADD CONSTRAINT mfa_challenges_requested_channel_check CHECK(requested_channel IN ('sms','whatsapp')),
  ADD CONSTRAINT mfa_challenges_reported_channel_check CHECK(reported_channel IN ('sms','whatsapp')),
  ADD CONSTRAINT mfa_challenges_provider_challenge_id_check CHECK(provider_challenge_id<>''),
  DROP COLUMN code_hash;

UPDATE auth_schema_meta SET version=4, updated_at=now() WHERE singleton=true;
