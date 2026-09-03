DROP TABLE IF EXISTS invites; DROP TABLE IF EXISTS user_permissions; DROP TABLE IF EXISTS user_roles; DROP TABLE IF EXISTS role_permissions; DROP TABLE IF EXISTS roles; DROP TABLE IF EXISTS users;
UPDATE auth_schema_meta SET version=1, updated_at=now() WHERE singleton=true;
