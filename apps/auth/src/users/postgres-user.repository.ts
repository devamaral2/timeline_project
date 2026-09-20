import { insertAuditEvents } from "../audit/postgres-audit-log";
import type { AuditEventInput } from "../audit/audit-event";
import type { RequestContext } from "../common/request-context";
import type { AuthDatabase, AuthTransaction } from "../db/client";
import { acquireAdvisoryLock, ADVISORY_LOCK } from "../db/transaction-locks";
import { coversSuperAdmin } from "../rbac/resolve-user-permissions";
import { resolveAccessInTransaction } from "../rbac/postgres-access";
import type {
  AdminUserSummary,
  ChangeUserStatusCommand,
  ChangeUserStatusOutcome,
  ListUsersPage,
  ListUsersQuery,
  ReplaceUserAccessCommand,
  ReplaceUserAccessOutcome,
  UserRepository,
} from "./ports/user-repository";
import type { User, UserStatus } from "./user";

function user(row: Record<string, unknown>): User { return { id: String(row.id), email: String(row.email), name: String(row.name), passwordHash: row.password_hash as string | null, status: row.status as User["status"], createdAt: row.created_at as Date, updatedAt: row.updated_at as Date }; }

/**
 * Transicoes aceitas. `disabled` e terminal, e `pending_invite -> active` nao
 * mora aqui: quem ativa um convidado e o aceite do convite, que preenche senha
 * no mesmo commit. Deixar o admin ativar alguem por fora criaria um
 * usuario `active` sem credencial.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  pending_invite: ["disabled"],
  active: ["suspended", "disabled"],
  suspended: ["active", "disabled"],
  disabled: [],
};

/**
 * Um administrador **capaz** e um usuario `active` cujo conjunto efetivo tem o
 * `*:manage` literal e cobre todas as acoes do catalogo. Qualquer `deny` que
 * retire um pedaco da cobertura o desqualifica: ele ainda parece admin na
 * tabela, mas ja nao consegue operar o painel inteiro.
 */
async function capableAdminCount(tx: AuthTransaction): Promise<number> {
  const candidates = (await tx.query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.status = 'active' AND (
       EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_key = ur.role_key WHERE ur.user_id = u.id AND rp.permission = '*:manage')
       OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = u.id AND up.permission = '*:manage' AND up.effect = 'allow'))`,
  )).rows;
  let capable = 0;
  for (const candidate of candidates) {
    if (coversSuperAdmin(await resolveAccessInTransaction(tx, candidate.id))) capable += 1;
  }
  return capable;
}

/**
 * `AuthDatabase.transaction` so faz ROLLBACK quando o callback lanca -- um
 * `return` normal comita. Como a invariante do ultimo admin so pode ser
 * verificada **depois** de aplicar a mudanca, o unico jeito de desfazer e
 * lancar. Esta excecao carrega o desfecho de volta para quem chamou.
 */
class RolledBackWith<T> extends Error {
  constructor(readonly outcome: T) { super("transaction rolled back"); }
}

async function rollbackAware<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { if (error instanceof RolledBackWith) return error.outcome as T; throw error; }
}

function revokedAllEvent(command: { actorUserId: string; targetUserId: string; now: Date; context: RequestContext }, count: number): AuditEventInput {
  return { correlationId: command.context.correlationId, actorUserId: command.actorUserId, action: "session.revoked_all", targetType: "user", targetId: command.targetUserId, result: "succeeded", reason: "status_left_active", metadata: { count }, context: command.context, occurredAt: command.now };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: AuthDatabase) {}

  async findById(id: string) { const r = await this.db.query("SELECT * FROM users WHERE id=$1", [id]); return r.rows[0] ? user(r.rows[0]) : null; }
  async findByEmail(email: string) { const r = await this.db.query("SELECT * FROM users WHERE email=$1", [email]); return r.rows[0] ? user(r.rows[0]) : null; }

  /** Paginacao por `id`, que e ULID: ordenar por ele e ordenar por criacao. */
  async listUsers(query: ListUsersQuery): Promise<ListUsersPage> {
    const rows = (await this.db.query<{ id: string; email: string; name: string; status: UserStatus; created_at: Date; updated_at: Date; role_keys: string[]; direct_permissions: { permission: string; effect: string }[] }>(
      `SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at,
              COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL), '{}') AS role_keys,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object('permission', up.permission, 'effect', up.effect)) FILTER (WHERE up.permission IS NOT NULL), '[]') AS direct_permissions
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_permissions up ON up.user_id = u.id
       WHERE ($1::text IS NULL OR u.id > $1)
       GROUP BY u.id
       ORDER BY u.id
       LIMIT $2`,
      [query.cursor, query.limit + 1],
    )).rows;
    const page = rows.slice(0, query.limit);
    return {
      users: page.map((row): AdminUserSummary => ({
        id: row.id, email: row.email, name: row.name, status: row.status,
        roleKeys: [...row.role_keys].sort(),
        directPermissions: row.direct_permissions.map((entry) => ({ permission: entry.permission as AdminUserSummary["directPermissions"][number]["permission"], effect: entry.effect as "allow" | "deny" })).sort((a, b) => a.permission.localeCompare(b.permission)),
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async changeStatusPreservingCapableAdmin(c: ChangeUserStatusCommand): Promise<ChangeUserStatusOutcome> {
    return rollbackAware(() => this.db.transaction(async (tx) => {
      await acquireAdvisoryLock(tx, ADVISORY_LOCK.capableAdmin);
      const current = (await tx.query<{ status: UserStatus }>("SELECT status FROM users WHERE id=$1 FOR UPDATE", [c.targetUserId])).rows[0];
      if (!current) return "not_found" as const;
      if (!ALLOWED_TRANSITIONS[current.status].includes(c.status)) return "invalid_status_transition" as const;

      await tx.query("UPDATE users SET status=$1, updated_at=$2 WHERE id=$3", [c.status, c.now, c.targetUserId]);
      const events = [...c.auditEvents];
      if (current.status === "active") {
        const revoked = await tx.query("UPDATE sessions SET revoked_at=$1, ended_at=$1 WHERE user_id=$2 AND revoked_at IS NULL", [c.now, c.targetUserId]);
        events.push(revokedAllEvent(c, revoked.rowCount ?? 0));
      }
      if (await capableAdminCount(tx) === 0) throw new RolledBackWith<ChangeUserStatusOutcome>("would_remove_last_admin");
      await insertAuditEvents(tx, events);
      return "updated" as const;
    }));
  }

  async replaceAccessPreservingCapableAdmin(c: ReplaceUserAccessCommand): Promise<ReplaceUserAccessOutcome> {
    return rollbackAware(() => this.db.transaction(async (tx) => {
      await acquireAdvisoryLock(tx, ADVISORY_LOCK.capableAdmin);
      const current = (await tx.query<{ id: string }>("SELECT id FROM users WHERE id=$1 FOR UPDATE", [c.targetUserId])).rows[0];
      if (!current) return "not_found" as const;

      // Substituicao total: o que nao veio no pedido deixa de existir.
      await tx.query("DELETE FROM user_roles WHERE user_id=$1", [c.targetUserId]);
      await tx.query("DELETE FROM user_permissions WHERE user_id=$1", [c.targetUserId]);
      for (const roleKey of c.roleKeys) await tx.query("INSERT INTO user_roles(user_id, role_key) VALUES($1,$2)", [c.targetUserId, roleKey]);
      for (const direct of c.directPermissions) await tx.query("INSERT INTO user_permissions(user_id, permission, effect) VALUES($1,$2,$3)", [c.targetUserId, direct.permission, direct.effect]);

      if (await capableAdminCount(tx) === 0) throw new RolledBackWith<ReplaceUserAccessOutcome>("would_remove_last_admin");
      await insertAuditEvents(tx, c.auditEvents);
      return "updated" as const;
    }));
  }
}
