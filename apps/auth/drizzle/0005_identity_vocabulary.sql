-- Vocabulario do servico centralizado (TDD §4, §5):
--   status  active | inactive | pending_sign_up | guest
--   email e phone opcionais (placeholder de signup e guest nao tem nenhum)
--   observes_user_id: o usuario que um guest pode ler
--   papeis admin e guest; member e viewer saem
--   invites vira signup_tokens, guardando o jti do JWT de signup
--   rate_limit_buckets.scope no vocabulario de login/signup/guest
--
-- Nao ha dado de producao no banco do auth (PRD §7.7). Mesmo assim a migracao
-- traduz o que existir em vez de falhar: pending_invite vira pending_sign_up,
-- suspended/disabled viram inactive, e quem tinha member/viewer fica sem papel
-- (nao existe equivalente no modelo de dois papeis; o downgrade e explicito).

-- users.status -----------------------------------------------------------
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%pending_invite%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

UPDATE users SET status = 'pending_sign_up' WHERE status = 'pending_invite';
UPDATE users SET status = 'inactive' WHERE status IN ('suspended', 'disabled');

ALTER TABLE users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'pending_sign_up', 'guest'));

-- email, phone, observes_user_id ------------------------------------------
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users
  ADD COLUMN phone text,
  ADD COLUMN observes_user_id text REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users
  ADD CONSTRAINT users_phone_unique UNIQUE (phone),
  ADD CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$'),
  ADD CONSTRAINT users_guest_has_no_credentials CHECK (status <> 'guest' OR (password_hash IS NULL AND email IS NULL AND phone IS NULL)),
  ADD CONSTRAINT users_guest_observes_someone CHECK (status <> 'guest' OR observes_user_id IS NOT NULL),
  ADD CONSTRAINT users_only_guests_observe CHECK (status = 'guest' OR observes_user_id IS NULL),
  ADD CONSTRAINT users_guest_not_self_observer CHECK (observes_user_id IS NULL OR observes_user_id <> id);

-- RBAC: cascata ao apagar o usuario --------------------------------------
ALTER TABLE user_roles DROP CONSTRAINT user_roles_user_id_fkey;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_permissions DROP CONSTRAINT user_permissions_user_id_fkey;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- RBAC: member/viewer saem, guest entra ----------------------------------
DELETE FROM user_roles WHERE role_key IN ('member', 'viewer');
DELETE FROM role_permissions WHERE role_key IN ('member', 'viewer');
DELETE FROM roles WHERE key IN ('member', 'viewer');
INSERT INTO roles (key, name, description, is_system, created_at) VALUES
  ('guest', 'Convidado', 'So le, e so os dados do usuario indicado em users.observes_user_id.', true, now())
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_key, permission) VALUES
  ('guest', 'event:read'), ('guest', 'tag:read')
ON CONFLICT DO NOTHING;
UPDATE roles SET description = 'Le, cria, altera e apaga tudo (*:manage).' WHERE key = 'admin';

-- invites -> signup_tokens ------------------------------------------------
-- Um convite antigo guarda o hash de um segredo opaco, que nao tem jti: nao
-- ha como converte-lo em link de signup.
DELETE FROM invites;
ALTER TABLE invites RENAME TO signup_tokens;
ALTER TABLE signup_tokens DROP COLUMN token_hash;
ALTER TABLE signup_tokens DROP COLUMN issuer_user_id;
ALTER TABLE signup_tokens RENAME COLUMN accepted_at TO consumed_at;
ALTER TABLE signup_tokens ADD COLUMN jti text NOT NULL;
ALTER TABLE signup_tokens ADD CONSTRAINT signup_tokens_jti_unique UNIQUE (jti);
ALTER TABLE signup_tokens RENAME CONSTRAINT invites_pkey TO signup_tokens_pkey;
ALTER TABLE signup_tokens DROP CONSTRAINT invites_user_id_fkey;
ALTER TABLE signup_tokens ADD CONSTRAINT signup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE signup_tokens ADD CONSTRAINT signup_tokens_single_outcome CHECK (consumed_at IS NULL OR revoked_at IS NULL);
DROP INDEX IF EXISTS invites_one_open_per_user;
CREATE UNIQUE INDEX signup_tokens_one_open_per_user ON signup_tokens (user_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- rate_limit_buckets.scope -----------------------------------------------
DELETE FROM rate_limit_buckets;
ALTER TABLE rate_limit_buckets DROP CONSTRAINT rate_limit_buckets_scope_check;
ALTER TABLE rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_scope_check CHECK (scope IN ('login_email', 'login_ip', 'signup_ip', 'guest_issuer'));

UPDATE auth_schema_meta SET version = 6, updated_at = now() WHERE singleton = true AND version < 6;
