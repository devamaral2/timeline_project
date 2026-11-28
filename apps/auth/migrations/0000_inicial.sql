-- O banco do auth em SQLite (ADR 0025). Nasce do estado final das migrations do Postgres (0000 a 0011, versao 8
-- do schema), com os papeis do sistema. Os dados de producao entram uma vez pelo `pnpm --filter @repo/auth run
-- db:copy-from-postgres`.
--
-- Tipos declarados: o adaptador do auth (`src/db/client.ts`) le o tipo de cada coluna e devolve a linha como o `pg`
-- devolvia, para os repositorios nao mudarem.
--   TIMESTAMP_TEXT  data e hora em texto ISO-8601 UTC com milissegundos; vira `Date`
--   JSON_TEXT       JSON em texto; vira objeto ou lista
--   BOOLEAN         0 ou 1; vira `boolean`
-- Os nomes tem `TEXT` e nao tem `INT` de proposito: assim a afinidade da coluna e TEXT e o SQLite nunca converte o
-- valor para numero.
--
-- O que o Postgres conferia de outro jeito:
--   - a regex das permissoes vira a lista fechada delas (o SQLite nao tem `~`);
--   - `amr <@ ARRAY[...]` precisa de subconsulta, que um CHECK nao aceita: vira trigger;
--   - o papel `auth_runtime` (so INSERT no `audit_log`) nao existe: os triggers recusam UPDATE e DELETE no
--     `audit_log` para qualquer conexao, e o acesso ao arquivo fica com a permissao do volume.

CREATE TABLE auth_schema_meta (
  singleton BOOLEAN PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at TIMESTAMP_TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- 9: a primeira versao em SQLite. Cada migration nova sobe este numero junto com `AUTH_SCHEMA_VERSION`.
INSERT INTO auth_schema_meta (singleton, version) VALUES (1, 9);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMP_TEXT NOT NULL,
  updated_at TIMESTAMP_TEXT NOT NULL,
  CONSTRAINT users_email_check CHECK (email = lower(trim(email)) AND email <> ''),
  CONSTRAINT users_name_check CHECK (name <> ''),
  CONSTRAINT users_status_check CHECK (status IN ('pending_invite', 'active', 'suspended', 'disabled')),
  CONSTRAINT users_active_requires_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);

CREATE TABLE roles (
  key TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_system BOOLEAN NOT NULL CHECK (is_system IN (0, 1)),
  created_at TIMESTAMP_TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_key TEXT NOT NULL REFERENCES roles (key),
  permission TEXT NOT NULL,
  PRIMARY KEY (role_key, permission),
  CONSTRAINT role_permissions_permission_check CHECK (permission IN (
    '*:manage', 'task:create', 'task:read', 'task:update', 'task:delete', 'task:manage', 'tag:create',
    'tag:read', 'tag:update', 'tag:delete', 'tag:manage', 'user:create', 'user:read', 'user:update',
    'user:delete', 'user:manage', 'invite:create', 'invite:read', 'invite:update', 'invite:delete',
    'invite:manage', 'role:create', 'role:read', 'role:update', 'role:delete', 'role:manage', 'grant:create',
    'grant:read', 'grant:update', 'grant:delete', 'grant:manage'
  ))
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users (id),
  role_key TEXT NOT NULL REFERENCES roles (key),
  PRIMARY KEY (user_id, role_key)
);

CREATE TABLE user_permissions (
  user_id TEXT NOT NULL REFERENCES users (id),
  permission TEXT NOT NULL,
  effect TEXT NOT NULL,
  PRIMARY KEY (user_id, permission),
  CONSTRAINT user_permissions_effect_check CHECK (effect IN ('allow', 'deny')),
  CONSTRAINT user_permissions_permission_check CHECK (permission IN (
    '*:manage', 'task:create', 'task:read', 'task:update', 'task:delete', 'task:manage', 'tag:create',
    'tag:read', 'tag:update', 'tag:delete', 'tag:manage', 'user:create', 'user:read', 'user:update',
    'user:delete', 'user:manage', 'invite:create', 'invite:read', 'invite:update', 'invite:delete',
    'invite:manage', 'role:create', 'role:read', 'role:update', 'role:delete', 'role:manage', 'grant:create',
    'grant:read', 'grant:update', 'grant:delete', 'grant:manage'
  ))
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id),
  issuer_user_id TEXT REFERENCES users (id),
  expires_at TIMESTAMP_TEXT NOT NULL,
  accepted_at TIMESTAMP_TEXT,
  revoked_at TIMESTAMP_TEXT,
  created_at TIMESTAMP_TEXT NOT NULL
);
CREATE UNIQUE INDEX invites_one_open_per_user ON invites (user_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  -- Os metodos de autenticacao, numa lista JSON nao vazia de 'pwd', 'otp' e 'recovery' (triggers abaixo).
  amr JSON_TEXT NOT NULL,
  auth_time TIMESTAMP_TEXT NOT NULL,
  initial_ip_address TEXT,
  initial_user_agent TEXT,
  last_used_at TIMESTAMP_TEXT NOT NULL,
  revoked_at TIMESTAMP_TEXT,
  ended_at TIMESTAMP_TEXT,
  created_at TIMESTAMP_TEXT NOT NULL,
  CONSTRAINT sessions_amr_check CHECK (json_valid(amr) AND json_type(amr) = 'array' AND json_array_length(amr) > 0),
  CONSTRAINT sessions_check CHECK (revoked_at IS NULL OR ended_at IS NOT NULL)
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE TRIGGER sessions_amr_known_insert BEFORE INSERT ON sessions
  WHEN EXISTS (SELECT 1 FROM json_each(NEW.amr) WHERE value NOT IN ('pwd', 'otp', 'recovery'))
BEGIN
  SELECT RAISE(ABORT, 'sessions.amr has an unknown authentication method');
END;
CREATE TRIGGER sessions_amr_known_update BEFORE UPDATE OF amr ON sessions
  WHEN EXISTS (SELECT 1 FROM json_each(NEW.amr) WHERE value NOT IN ('pwd', 'otp', 'recovery'))
BEGIN
  SELECT RAISE(ABORT, 'sessions.amr has an unknown authentication method');
END;

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  expires_at TIMESTAMP_TEXT NOT NULL,
  consumed_at TIMESTAMP_TEXT,
  successor_id TEXT REFERENCES refresh_tokens (id),
  created_at TIMESTAMP_TEXT NOT NULL,
  -- O token vale 30 dias a partir da emissao, nem mais nem menos.
  CONSTRAINT refresh_tokens_check CHECK (expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 days'))
);
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens (session_id);

CREATE TABLE signing_keys (
  kid TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  public_jwk JSON_TEXT NOT NULL CHECK (json_valid(public_jwk) AND json_type(public_jwk) = 'object'),
  encrypted_private_key TEXT,
  created_at TIMESTAMP_TEXT NOT NULL,
  last_used_at TIMESTAMP_TEXT,
  retire_after TIMESTAMP_TEXT,
  retired_at TIMESTAMP_TEXT,
  CONSTRAINT signing_keys_status_check CHECK (status IN ('active', 'retiring', 'retired')),
  CONSTRAINT signing_keys_check CHECK (status <> 'retired' OR encrypted_private_key IS NULL)
);
CREATE UNIQUE INDEX signing_keys_one_active ON signing_keys (status) WHERE status = 'active';

CREATE TABLE device_keys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  label TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission = 'transcription:work'),
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP_TEXT NOT NULL,
  last_used_at TIMESTAMP_TEXT,
  revoked_at TIMESTAMP_TEXT
);
CREATE INDEX device_keys_user_idx ON device_keys (user_id);

CREATE TABLE rate_limit_buckets (
  scope TEXT NOT NULL CHECK (scope IN ('password_email', 'password_ip')),
  subject_hash TEXT NOT NULL,
  window_started_at TIMESTAMP_TEXT NOT NULL,
  window_expires_at TIMESTAMP_TEXT NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count > 0),
  blocked_until TIMESTAMP_TEXT,
  updated_at TIMESTAMP_TEXT NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

-- So se acrescenta: nenhuma conexao altera nem apaga uma linha.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('succeeded', 'failed')),
  reason TEXT,
  metadata JSON_TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP_TEXT NOT NULL
);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

INSERT INTO roles (key, name, description, is_system, created_at) VALUES
  ('admin', 'Administrador', 'Gerencia usuarios, convites, papeis e concessoes de acesso.', 1, '2026-01-01T00:00:00.000Z'),
  ('member', 'Membro', 'Dono da propria timeline: cria, edita e apaga as proprias tarefas.', 1, '2026-01-01T00:00:00.000Z'),
  ('viewer', 'Observador', 'So le. Sem concessao explicita, enxerga apenas a propria timeline.', 1, '2026-01-01T00:00:00.000Z');
INSERT INTO role_permissions (role_key, permission) VALUES
  ('admin', '*:manage'),
  ('member', 'tag:create'), ('member', 'tag:read'),
  ('member', 'task:create'), ('member', 'task:read'), ('member', 'task:update'), ('member', 'task:delete'),
  ('viewer', 'tag:read'), ('viewer', 'task:read');
