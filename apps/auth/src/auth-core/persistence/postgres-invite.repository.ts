import { acquireAdvisoryLock, ADVISORY_LOCK } from "../../db/transaction-locks";
import { randomUUID } from "node:crypto";
import type { AuthDatabase, AuthTransaction } from "../../db/client";
import type { AuditEventInput } from "../../audit/audit-event";
import type { DirectPermission } from "../../domain/rbac/effective-permissions";
import type { BootstrapAdminCommand, BootstrapAdminCommitOutcome, InviteInspection } from "../../domain/invites/invite";
import { insertAuditEvents } from "../../audit/postgres-audit-log";

export interface NewInviteWrite { id: string; tokenHash: string; expiresAt: Date }
export interface CreateInviteCommand {
  userId: string;
  email: string;
  name: string;
  roleKeys: readonly string[];
  directPermissions: readonly DirectPermission[];
  invite: NewInviteWrite;
  issuerUserId: string;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}
export type CreateInviteOutcome = { kind: "created"; userId: string } | { kind: "email_already_exists" };
export interface AcceptInviteCommand { inviteId:string; userId:string; passwordHash:string; now:Date; auditEvents:readonly AuditEventInput[] }

export class PostgresInviteRepository {
  constructor(private readonly db: AuthDatabase) {}
  async acceptInvite(c: AcceptInviteCommand): Promise<"accepted"|"invalid"> {
    return this.db.transaction(async tx => {
      const user = await tx.query("SELECT id FROM users WHERE id=$1 AND status='pending_invite' FOR UPDATE", [c.userId]);
      if (!user.rowCount) return "invalid" as const;
      const invite = await tx.query("SELECT id FROM invites WHERE id=$1 AND user_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>$3 FOR UPDATE", [c.inviteId,c.userId,c.now]);
      if (!invite.rowCount) return "invalid" as const;
      await tx.query("UPDATE users SET password_hash=$1,status='active',updated_at=$2 WHERE id=$3", [c.passwordHash,c.now,c.userId]);
      await tx.query("UPDATE invites SET accepted_at=$1 WHERE id=$2", [c.now,c.inviteId]);
      await tx.query("UPDATE invites SET revoked_at=$1 WHERE user_id=$2 AND id<>$3 AND accepted_at IS NULL AND revoked_at IS NULL", [c.now,c.userId,c.inviteId]);
      await insertAuditEvents(tx,c.auditEvents);
      return "accepted" as const;
    });
  }

  async inspectByTokenHash(hash:string, now:Date):Promise<InviteInspection|null> { const r=await this.db.query("SELECT i.id invite_id,i.user_id,u.name,u.email,i.expires_at FROM invites i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 AND i.expires_at>$2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL",[hash,now]); const x=r.rows[0]; return x ? {inviteId:x.invite_id,userId:x.user_id,name:x.name,email:x.email,expiresAt:x.expires_at}:null; }
  async bootstrapAdmin(command:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { return this.db.transaction(async tx => this.commit(tx,command)); }
  private async commit(tx:AuthTransaction,c:BootstrapAdminCommand):Promise<BootstrapAdminCommitOutcome> { await acquireAdvisoryLock(tx,ADVISORY_LOCK.bootstrapAdmin); const admins=await tx.query("SELECT u.id,u.email,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_key='admin' FOR UPDATE"); if (admins.rowCount===0) { await tx.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,'pending_invite',$4,$4)",[c.userId,c.email,c.name,c.now]); await tx.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,'admin')",[c.userId]); await this.insertInvite(tx,c); await this.audit(tx,c); return {kind:"created",userId:c.userId}; }
    const admin=admins.rows[0]; if (admins.rowCount===1 && admin.email===c.email && admin.status==='pending_invite') { await tx.query("UPDATE invites SET revoked_at=$1 WHERE user_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",[c.now,admin.id]); await this.insertInvite(tx,{...c,userId:admin.id}); await this.audit(tx,c); return {kind:"reissued",userId:admin.id}; }
    return admins.rowCount===1 && admin.status==='pending_invite' ? {kind:"conflicting_pending_admin"} : {kind:"already_initialized"}; }
  private async insertInvite(tx:AuthTransaction,c:BootstrapAdminCommand){ await tx.query("INSERT INTO invites(id,token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",[c.invite.id,c.invite.tokenHash,c.userId,c.invite.expiresAt,c.now]); }
  private async audit(tx:AuthTransaction,c:BootstrapAdminCommand){ for(const e of c.auditEvents) await tx.query("INSERT INTO audit_log(id,correlation_id,actor_user_id,action,target_type,target_id,result,reason,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),e.correlationId,e.actorUserId,e.action,e.targetType,e.targetId,e.result,e.reason,e.metadata,e.context.ipAddress,e.context.userAgent,e.occurredAt]); }

  /**
   * Convite novo: usuario `pending_invite`, papeis, permissoes diretas, o
   * proprio convite e a auditoria no mesmo commit. O convidado nunca escolhe o
   * proprio acesso -- ele ja nasce montado aqui, e o aceite so preenche senha e
   * telefone.
   */
  async createPendingUserWithAccessAndInvite(c:CreateInviteCommand):Promise<CreateInviteOutcome> {
    return this.db.transaction(async tx => {
      const existing=await tx.query("SELECT id FROM users WHERE email=$1",[c.email]);
      if (existing.rowCount) return {kind:"email_already_exists"} as const;
      await tx.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,'pending_invite',$4,$4)",[c.userId,c.email,c.name,c.now]);
      for (const roleKey of c.roleKeys) await tx.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,$2)",[c.userId,roleKey]);
      for (const direct of c.directPermissions) await tx.query("INSERT INTO user_permissions(user_id,permission,effect) VALUES($1,$2,$3)",[c.userId,direct.permission,direct.effect]);
      await tx.query("INSERT INTO invites(id,token_hash,user_id,issuer_user_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)",[c.invite.id,c.invite.tokenHash,c.userId,c.issuerUserId,c.invite.expiresAt,c.now]);
      await insertAuditEvents(tx,c.auditEvents);
      return {kind:"created",userId:c.userId} as const;
    });
  }

}

export type InviteRepository = Pick<PostgresInviteRepository, 'acceptInvite' | 'inspectByTokenHash' | 'bootstrapAdmin' | 'createPendingUserWithAccessAndInvite'>;
