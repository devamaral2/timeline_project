DROP TABLE IF EXISTS recovery_codes; DROP TABLE IF EXISTS refresh_tokens; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS mfa_challenges; DROP TABLE IF EXISTS authentication_attempts;
UPDATE auth_schema_meta SET version=2, updated_at=now() WHERE singleton=true;
