-- Execute as the migration owner. Replace identifiers before executing.
-- The runtime role deliberately cannot update or delete audit_log.
REVOKE ALL ON SCHEMA public FROM auth_runtime;
GRANT USAGE ON SCHEMA public TO auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO auth_runtime;
REVOKE ALL ON TABLE audit_log FROM auth_runtime;
GRANT INSERT ON TABLE audit_log TO auth_runtime;
