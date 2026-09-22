-- A branch atual voltou ao schema de auth v5, mas bancos locais que passaram
-- pelas migrations 0005/0006 ainda carregam o vocabulario de scopes da branch
-- posterior (login_email/login_ip/...). Buckets de rate limit sao efemeros e
-- os hashes tambem dependem do scope, portanto nao ha dado valido para migrar.
DELETE FROM rate_limit_buckets;

ALTER TABLE rate_limit_buckets
  DROP CONSTRAINT IF EXISTS rate_limit_buckets_scope_check;

ALTER TABLE rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_scope_check
  CHECK (scope IN ('password_email', 'password_ip', 'mfa_send_user', 'factor_check_attempt'));

-- O codigo desta branch termina no schema v5. Bancos que vieram da branch
-- posterior precisam voltar a anunciar a versao que o runtime atual valida.
UPDATE auth_schema_meta
SET version = 5, updated_at = now()
WHERE singleton = true;
