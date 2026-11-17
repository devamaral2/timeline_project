-- Reverte 0010: `task:<acao>` volta a `event:<acao>` e os checks voltam a aceitar `event`.
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_check;
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_permission_check;

UPDATE role_permissions SET permission = 'event:' || substr(permission, length('task:') + 1) WHERE permission LIKE 'task:%';
UPDATE user_permissions SET permission = 'event:' || substr(permission, length('task:') + 1) WHERE permission LIKE 'task:%';

UPDATE roles SET description = 'Dono da propria timeline: cria, edita e apaga os proprios eventos.' WHERE key = 'member';

ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_check
  CHECK (permission = '*:manage' OR permission ~ '^(event|tag|user|invite|role|grant):(create|read|update|delete|manage)$');
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_permission_check
  CHECK (permission = '*:manage' OR permission ~ '^(event|tag|user|invite|role|grant):(create|read|update|delete|manage)$');

UPDATE auth_schema_meta SET version = 6, updated_at = now() WHERE singleton = true;
