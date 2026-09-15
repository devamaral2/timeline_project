/**
 * Ator resolvido por GET /auth/me do apps/auth. `roles`/`permissions` sao
 * opcionais porque hoje nenhum usecase os le (so `userId`, para ownership) —
 * ficam aqui para quando RBAC por rota existir, sem forcar todo fixture de
 * teste a preenche-los.
 */
export interface AuthenticatedUser {
  userId: string;
  roles?: string[];
  permissions?: string[];
}
