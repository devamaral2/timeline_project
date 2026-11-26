-- Chaves de dispositivo: credencial de vida longa e revogavel de um servico
-- fora da VPS (o servico local de transcricao). Guarda so o hash da chave.
-- A permissao nao e de papel (RBAC): e uma unica, fixa por check.
CREATE TABLE device_keys (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  label text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('transcription:work')),
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX device_keys_user_idx ON device_keys (user_id);

UPDATE auth_schema_meta SET version = 8, updated_at = now() WHERE singleton = true;
