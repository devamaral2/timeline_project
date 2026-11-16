-- A entidade "evento" passou a se chamar "tarefa": `event:<acao>` vira `task:<acao>`
-- nas permissoes de papel e nas de usuario (allow e deny), sem perder acesso.
-- Os checks de formato passam a aceitar `task` e a recusar `event`.
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_check;
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_permission_check;

UPDATE role_permissions SET permission = 'task:' || substr(permission, length('event:') + 1) WHERE permission LIKE 'event:%'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions existing
    WHERE existing.role_key = role_permissions.role_key
      AND existing.permission = 'task:' || substr(role_permissions.permission, length('event:') + 1)
  );
DELETE FROM role_permissions WHERE permission LIKE 'event:%';

UPDATE user_permissions SET permission = 'task:' || substr(permission, length('event:') + 1) WHERE permission LIKE 'event:%'
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions existing
    WHERE existing.user_id = user_permissions.user_id
      AND existing.permission = 'task:' || substr(user_permissions.permission, length('event:') + 1)
  );
DELETE FROM user_permissions WHERE permission LIKE 'event:%';

UPDATE roles SET description = 'Dono da propria timeline: cria, edita e apaga as proprias tarefas.' WHERE key = 'member';

ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_check
  CHECK (permission = '*:manage' OR permission ~ '^(task|tag|user|invite|role|grant):(create|read|update|delete|manage)$');
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_permission_check
  CHECK (permission = '*:manage' OR permission ~ '^(task|tag|user|invite|role|grant):(create|read|update|delete|manage)$');

UPDATE auth_schema_meta SET version = 7, updated_at = now() WHERE singleton = true;
