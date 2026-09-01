/**
 * O vocabulario de permissoes. Uma permissao e sempre `recurso:acao` — string,
 * e nao enum, porque ela viaja dentro do JWT e e comparada por outros servicos.
 *
 * As acoes CRUD valem sobre **o proprio conteudo do usuario** (e sobre o que
 * lhe foi concedido explicitamente). `manage` e diferente: vale sobre o recurso
 * inteiro, de qualquer dono. Essa e a linha que separa um usuario comum de um
 * admin, e ela mora aqui e nao espalhada por ifs.
 */
export const RESOURCES = ["event", "tag", "user", "invite", "role", "grant"] as const;
export const ACTIONS = ["create", "read", "update", "delete", "manage"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Resource}:${Action}` | `*:manage`;

/** Superadmin. Unica forma de curinga aceita — nao existe `*:read` nem `event:*`. */
export const SUPER_ADMIN_PERMISSION = "*:manage" satisfies Permission;

/** As acoes que `manage` engloba. `manage` tambem engloba a si mesmo. */
const MANAGED_ACTIONS: readonly Action[] = ["create", "read", "update", "delete", "manage"];

export function permissionKey(resource: Resource, action: Action): Permission {
  return `${resource}:${action}` as Permission;
}

export function isResource(value: string): value is Resource {
  return (RESOURCES as readonly string[]).includes(value);
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  if (value === SUPER_ADMIN_PERMISSION) return true;
  const [resource, action, ...rest] = value.split(":");
  return rest.length === 0 && isResource(resource ?? "") && isAction(action ?? "");
}

/**
 * `event:manage` cobre `event:read`; `*:manage` cobre tudo. Comparar strings
 * cruas ignoraria as duas relacoes — e um admin cairia em 403 no proprio painel.
 */
export function permissionSetCovers(
  permissions: Iterable<string>,
  resource: Resource,
  action: Action,
): boolean {
  const wanted = permissionKey(resource, action);
  const managed = permissionKey(resource, "manage");

  for (const permission of permissions) {
    if (permission === SUPER_ADMIN_PERMISSION) return true;
    if (permission === wanted) return true;
    if (permission === managed && MANAGED_ACTIONS.includes(action)) return true;
  }
  return false;
}

/** Todas as permissoes concretas — util para o painel de admin montar as caixas. */
export function allPermissions(): Permission[] {
  return RESOURCES.flatMap((resource) => ACTIONS.map((action) => permissionKey(resource, action)));
}
