-- Bancos que passaram pela antiga 0006 perderam o audit_log, mas o runtime
-- atual grava a auditoria do login na mesma transacao da sessao. A tabela e
-- recriada vazia; nenhum dado existente e removido.
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

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

UPDATE auth_schema_meta
SET version = 5, updated_at = now()
WHERE singleton = true;
