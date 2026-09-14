-- Reverte a forma do schema para o vocabulario de convites. Dado que so existe
-- no modelo novo nao volta: guests e placeholders de signup sao apagados (a
-- cascata leva papeis e tokens), tokens de signup nao viram convites, e quem
-- perdeu member/viewer continua sem papel.

DELETE FROM users WHERE status IN ('guest', 'pending_sign_up');
UPDATE users SET status = 'suspended' WHERE status = 'inactive';

DELETE FROM rate_limit_buckets;
ALTER TABLE rate_limit_buckets DROP CONSTRAINT rate_limit_buckets_scope_check;
ALTER TABLE rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_scope_check CHECK (scope IN ('password_email', 'password_ip', 'mfa_send_user', 'factor_check_attempt'));

DELETE FROM signup_tokens;
DROP INDEX IF EXISTS signup_tokens_one_open_per_user;
ALTER TABLE signup_tokens DROP CONSTRAINT signup_tokens_single_outcome;
ALTER TABLE signup_tokens DROP CONSTRAINT signup_tokens_user_id_fkey;
ALTER TABLE signup_tokens ADD CONSTRAINT invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE signup_tokens RENAME CONSTRAINT signup_tokens_pkey TO invites_pkey;
ALTER TABLE signup_tokens DROP CONSTRAINT signup_tokens_jti_unique;
ALTER TABLE signup_tokens DROP COLUMN jti;
ALTER TABLE signup_tokens RENAME COLUMN consumed_at TO accepted_at;
ALTER TABLE signup_tokens ADD COLUMN issuer_user_id text REFERENCES users(id);
ALTER TABLE signup_tokens ADD COLUMN token_hash text NOT NULL UNIQUE;
ALTER TABLE signup_tokens RENAME TO invites;
CREATE UNIQUE INDEX invites_one_open_per_user ON invites (user_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;

DELETE FROM user_roles WHERE role_key = 'guest';
DELETE FROM role_permissions WHERE role_key = 'guest';
DELETE FROM roles WHERE key = 'guest';
INSERT INTO roles (key, name, description, is_system, created_at) VALUES
  ('member', 'Membro', 'Dono da propria timeline: cria, edita e apaga os proprios eventos.', true, now()),
  ('viewer', 'Observador', 'So le. Sem concessao explicita, enxerga apenas a propria timeline.', true, now())
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_key, permission) VALUES
  ('member', 'event:create'), ('member', 'event:read'), ('member', 'event:update'), ('member', 'event:delete'),
  ('member', 'tag:create'), ('member', 'tag:read'), ('viewer', 'event:read'), ('viewer', 'tag:read')
ON CONFLICT DO NOTHING;
UPDATE roles SET description = 'Gerencia usuarios, convites, papeis e concessoes de acesso.' WHERE key = 'admin';

ALTER TABLE user_permissions DROP CONSTRAINT user_permissions_user_id_fkey;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_roles DROP CONSTRAINT user_roles_user_id_fkey;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE users
  DROP CONSTRAINT users_guest_not_self_observer,
  DROP CONSTRAINT users_only_guests_observe,
  DROP CONSTRAINT users_guest_observes_someone,
  DROP CONSTRAINT users_guest_has_no_credentials,
  DROP CONSTRAINT users_phone_e164,
  DROP CONSTRAINT users_phone_unique;
ALTER TABLE users DROP COLUMN observes_user_id, DROP COLUMN phone;
DELETE FROM users WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check CHECK (status IN ('pending_invite', 'active', 'suspended', 'disabled'));

UPDATE auth_schema_meta SET version = 5, updated_at = now() WHERE singleton = true;
