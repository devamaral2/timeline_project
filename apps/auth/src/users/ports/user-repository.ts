import type { AuditEventInput } from "../../audit/audit-event";
import type { RequestContext } from "../../common/request-context";
import type { DirectPermission } from "../../rbac/effective-permissions";
import type { User, UserStatus } from "../user";

/**
 * O que o painel de admin ve de um usuario. A lista de chaves e o contrato:
 * nao ha `passwordHash`, `phoneE164`, convite, recovery code nem hash nenhum
 * aqui, e o teste de e2e compara as chaves exatas para que acrescentar um
 * campo sensivel sem querer quebre a suite.
 */
export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roleKeys: string[];
  directPermissions: DirectPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersQuery { cursor: string | null; limit: number }
export interface ListUsersPage { users: AdminUserSummary[]; nextCursor: string | null }

export interface ChangeUserStatusCommand {
  targetUserId: string;
  status: UserStatus;
  actorUserId: string;
  now: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}
export type ChangeUserStatusOutcome = "updated" | "would_remove_last_admin" | "invalid_status_transition" | "not_found";

export interface ReplaceUserAccessCommand {
  targetUserId: string;
  roleKeys: readonly string[];
  directPermissions: readonly DirectPermission[];
  actorUserId: string;
  now: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}
export type ReplaceUserAccessOutcome = "updated" | "would_remove_last_admin" | "not_found";

/**
 * As duas escritas administrativas terminam com a mesma pergunta: **sobrou
 * algum administrador capaz?** Elas disputam o mesmo advisory lock justamente
 * para que duas remocoes simultaneas nao respondam "sim" cada uma olhando para
 * o outro admin que a concorrente esta prestes a derrubar.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(normalizedEmail: string): Promise<User | null>;
  listUsers(query: ListUsersQuery): Promise<ListUsersPage>;
  changeStatusPreservingCapableAdmin(command: ChangeUserStatusCommand): Promise<ChangeUserStatusOutcome>;
  replaceAccessPreservingCapableAdmin(command: ReplaceUserAccessCommand): Promise<ReplaceUserAccessOutcome>;
}

/** A metade de leitura da porta. Quem so precisa achar um usuario depende
 *  disto, e nao da porta inteira: um usecase de login nao tem por que enxergar
 *  as escritas administrativas. */
export type UserReader = Pick<UserRepository, "findById" | "findByEmail">;
