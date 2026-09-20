import type { AdminUserSummary, ListUsersPage, UserRepository } from "../ports/user-repository";

export const MAX_ADMIN_PAGE_SIZE = 100;
export const DEFAULT_ADMIN_PAGE_SIZE = 25;

/**
 * Listagem do painel. O resumo devolvido e o `AdminUserSummary` inteiro e nada
 * alem dele: senha, telefone, convite e recovery code nao passam por aqui nem
 * como campo opcional.
 */
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(input: { cursor: string | null; limit: number | null }): Promise<ListUsersPage> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_ADMIN_PAGE_SIZE, 1), MAX_ADMIN_PAGE_SIZE);
    return this.users.listUsers({ cursor: input.cursor, limit });
  }
}

export type { AdminUserSummary };
