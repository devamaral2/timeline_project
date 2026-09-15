-- O codigo que escrevia nestas tabelas saiu do servico (MFA, recovery codes,
-- step-up e audit log). Commit so de DDL, separado da delecao do codigo, para
-- revisar e reverter por conta propria. As quatro tabelas de RBAC ficam.

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
DROP TABLE IF EXISTS mfa_challenges;
DROP TABLE IF EXISTS authentication_attempts;
DROP TABLE IF EXISTS recovery_codes;
DROP TABLE IF EXISTS audit_log;
DROP FUNCTION IF EXISTS reject_audit_mutation();

UPDATE auth_schema_meta SET version = 7, updated_at = now() WHERE singleton = true AND version < 7;
