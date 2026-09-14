-- Execute as the migration owner. Replace identifiers before executing.
-- The runtime role deliberately cannot update or delete audit_log.
REVOKE ALL ON SCHEMA public FROM auth_runtime;
GRANT USAGE ON SCHEMA public TO auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO auth_runtime;
-- Tables created by later migrations (signup_tokens and whatever comes next)
-- must not depend on someone re-running this file: without default privileges
-- the suite stays green (tests grant after migrating) while production answers
-- "permission denied" on the first request that touches the new table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_runtime;
REVOKE ALL ON TABLE audit_log FROM auth_runtime;
GRANT INSERT ON TABLE audit_log TO auth_runtime;
