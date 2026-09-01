CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''), name text NOT NULL CHECK (name <> ''),
  password_hash text, phone_e164 text, phone_verified_at timestamptz, mfa_channel text,
  status text NOT NULL CHECK (status IN ('pending_invite','active','suspended','disabled')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  CHECK (mfa_channel IS NULL OR mfa_channel IN ('sms','whatsapp')),
  CHECK (status <> 'active' OR (password_hash IS NOT NULL AND phone_e164 ~ '^\\+[1-9][0-9]{1,14}$' AND phone_verified_at IS NOT NULL AND mfa_channel IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS roles (key text PRIMARY KEY, name text NOT NULL, description text NOT NULL, is_system boolean NOT NULL, created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS role_permissions (role_key text NOT NULL REFERENCES roles(key), permission text NOT NULL CHECK (permission = '*:manage' OR permission ~ '^(event|tag|user|invite|role|grant):(create|read|update|delete|manage)$'), PRIMARY KEY(role_key, permission));
CREATE TABLE IF NOT EXISTS user_roles (user_id text NOT NULL REFERENCES users(id), role_key text NOT NULL REFERENCES roles(key), PRIMARY KEY(user_id, role_key));
CREATE TABLE IF NOT EXISTS user_permissions (user_id text NOT NULL REFERENCES users(id), permission text NOT NULL CHECK (permission = '*:manage' OR permission ~ '^(event|tag|user|invite|role|grant):(create|read|update|delete|manage)$'), effect text NOT NULL CHECK(effect IN ('allow','deny')), PRIMARY KEY(user_id, permission));
CREATE TABLE IF NOT EXISTS invites (id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES users(id), issuer_user_id text REFERENCES users(id), expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS invites_one_open_per_user ON invites(user_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
INSERT INTO roles(key,name,description,is_system,created_at) VALUES
 ('admin','Administrador','Gerencia usuarios, convites, papeis e concessoes de acesso.',true,now()),
 ('member','Membro','Dono da propria timeline: cria, edita e apaga os proprios eventos.',true,now()),
 ('viewer','Observador','So le. Sem concessao explicita, enxerga apenas a propria timeline.',true,now()) ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_key,permission) VALUES
 ('admin','*:manage'), ('member','event:create'), ('member','event:read'), ('member','event:update'), ('member','event:delete'), ('member','tag:create'), ('member','tag:read'), ('viewer','event:read'), ('viewer','tag:read') ON CONFLICT DO NOTHING;
UPDATE auth_schema_meta SET version=2, updated_at=now() WHERE singleton=true AND version < 2;
