/**
 * Ator resolvido por GET /auth/me do apps/auth. `roles`/`permissions`/`denies`
 * sao opcionais para nao forcar todo fixture de teste a preenche-los; quem
 * decide acesso de admin (`assertCanActFor`) trata ausencia como "nao e admin".
 */
export interface AuthenticatedUser {
  userId: string;
  roles?: string[];
  permissions?: string[];
  denies?: string[];
}
